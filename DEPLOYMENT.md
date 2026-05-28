# Deployment Guide

> WhaTap Picker를 AWS EC2(t3.micro / Amazon Linux 2023)에 GitHub Actions로 배포하는 가이드.
>
> **흐름**: `main` 브랜치 푸시 → GHA가 jar+Docker 이미지 빌드 → GHCR push → SSH로 EC2 접속 → `.env` 자동 작성 → `docker compose pull && up -d` → 헬스체크

---

## 1. 아키텍처 한눈에

```
┌──────────────────┐  push   ┌──────────────────────────┐
│  GitHub (main)   ├────────►│  GitHub Actions          │
└──────────────────┘         │  - gradle bootJar         │
                             │  - docker buildx         │
                             │  - push to GHCR          │
                             │  - ssh deploy            │
                             └──────────┬───────────────┘
                                        │ scp + ssh
                                        ▼
┌─────────────────────────────────────────────────────────┐
│  AWS EC2 (t3.micro, Amazon Linux 2023, 1GB RAM, 8GB)     │
│                                                          │
│   /opt/whatap-picker/                                    │
│     ├─ docker-compose.prod.yml   (GHA가 scp)            │
│     └─ .env                       (GHA가 매 배포마다 작성)│
│                                                          │
│   docker compose:                                        │
│     ┌──────────┐    ┌──────────────────────────────┐   │
│     │ postgres │◄───┤ app (ghcr.io/.../picker:SHA) │   │
│     └──────────┘    └────────────┬─────────────────┘   │
│                                  │ 8080 노출           │
└──────────────────────────────────┼───────────────────────┘
                                   │
                                   ▼
                              public IP:8080
```

**제외된 것**
- Ollama 컨테이너 — t3.micro RAM 1GB로는 qwen2.5:1.5b(3GB 요구) 구동 불가.
  AI 리드 등급은 시드 룰 8개로 약 80~85% 커버, LLM 폴백 호출은 실패 → `LeadScore.ai_status=FAILED`로 기록되어 어드민 화면에서 재시도 가능.
  추후 EC2 사양 업그레이드 시 `docker-compose.prod.yml`에 Ollama 서비스 추가하고 `SPRING_AI_OLLAMA_INIT_PULL_MODEL_STRATEGY=when_missing`으로 전환하면 됩니다.

---

## 2. 사전 준비 (1회만)

### 2.1 EC2 인스턴스 생성

| 항목 | 값 |
| --- | --- |
| AMI | Amazon Linux 2023 |
| 인스턴스 유형 | t3.micro |
| 키 페어 | 새로 생성 → `.pem` 다운로드 (예: `picker-key.pem`) |
| 네트워크 | 기본 VPC, public subnet |
| 퍼블릭 IP 자동 할당 | ✅ |
| 보안 그룹 | 새로 생성 (이름: `picker-sg`) |
| 스토리지 | 8 GiB gp3 |

**보안그룹 인바운드 규칙**

| 타입 | 프로토콜 | 포트 | 소스 | 용도 |
| --- | --- | --- | --- | --- |
| SSH | TCP | 22 | **본인 IP/32** | 관리 |
| Custom TCP | TCP | 8080 | `0.0.0.0/0` (데모 시) 또는 사내망 CIDR | 앱 접속 |

> 💡 **데모 끝나면 8080 소스를 좁히거나 인스턴스를 stop** 해두세요. t3.micro는 프리티어지만 EBS는 시간당 과금 (그러나 8GB는 거의 무료에 가까움).

### 2.2 EC2 초기 세팅 (스크립트 1회 실행)

EC2에 SSH 접속 후:

```bash
# 로컬에서 EC2로 setup 스크립트 복사
scp -i ~/Downloads/picker-key.pem deploy/setup-ec2.sh ec2-user@<EC2_PUBLIC_IP>:~/

# SSH 접속
ssh -i ~/Downloads/picker-key.pem ec2-user@<EC2_PUBLIC_IP>

# 스크립트 실행
bash setup-ec2.sh

# Docker 그룹 권한 반영을 위해 재접속
exit
ssh -i ~/Downloads/picker-key.pem ec2-user@<EC2_PUBLIC_IP>
docker ps   # 권한 없이 잘 나오면 OK
```

스크립트가 하는 일:
- `dnf update` + `docker` 설치 + 부팅 시 자동 시작
- `docker compose` 플러그인 설치
- 2GB swap 추가 (`/swapfile`) + `swappiness=10` 설정
- `/opt/whatap-picker/` 디렉토리 생성 (GHA가 여기로 파일 던짐)
- 매일 새벽 4시 `docker image prune` cron 등록 (8GB 디스크 보호)

### 2.3 GitHub Secrets 등록

`https://github.com/jin-0309/Whatap-Picker/settings/secrets/actions` 에서 **New repository secret** 으로 다음 8개 등록:

| Secret 이름 | 값 | 만드는 법 |
| --- | --- | --- |
| `EC2_HOST` | EC2 퍼블릭 IP 또는 DNS | AWS 콘솔에서 복사 |
| `EC2_USER` | `ec2-user` | AL2023 기본 사용자 |
| `EC2_SSH_KEY` | `picker-key.pem` 파일 **전체 내용** (`-----BEGIN ...` 부터 `END ...-----` 까지) | 로컬에서 `cat picker-key.pem` 결과 복사 |
| `JWT_SECRET` | 32바이트 랜덤 문자열 | `openssl rand -base64 32` |
| `BOOTSTRAP_ADMIN_USERNAME` | `admin` (또는 원하는 값) | 직접 입력 |
| `BOOTSTRAP_ADMIN_PASSWORD` | 강한 비밀번호 | 직접 생성 (예: 1Password 등) |
| `POSTGRES_PASSWORD` | 강한 비밀번호 | 직접 생성 |
| `APP_PUBLIC_BASE_URL` | `http://<EC2_PUBLIC_IP>:8080` | EC2 퍼블릭 IP에 맞춰 작성 |

> ⚠️ `EC2_SSH_KEY`는 줄바꿈 포함 그대로 붙여넣어야 합니다. GitHub UI에서 자동으로 보존됩니다.

> ⚠️ `JWT_SECRET`, `POSTGRES_PASSWORD`는 **한 번 정하면 바꾸지 마세요**.
> - `JWT_SECRET` 변경 시 발급된 운영자 JWT 토큰이 모두 무효화 (재로그인 필요)
> - `POSTGRES_PASSWORD` 변경 시 기존 DB 볼륨과 불일치하여 앱이 DB 접속 실패. 변경하려면 EC2에서 `docker compose down -v`로 볼륨 삭제하고 처음부터 (데이터 다 날아감)

---

## 3. 첫 배포

위 2단계까지 끝났으면 단순히 main에 푸시하면 됩니다.

```bash
git push origin main
```

GitHub Actions가:
1. `gradle bootJar` 로 jar 빌드 (테스트 스킵)
2. Dockerfile로 이미지 빌드 (`ghcr.io/jin-0309/whatap-picker:latest` + `:<7자리 SHA>`)
3. GHCR에 push (public repo라 누구나 pull 가능, EC2에서 인증 불요)
4. EC2에 `docker-compose.prod.yml` scp
5. EC2 SSH 접속 → `.env` 작성 → `docker compose pull && up -d`
6. `http://<EC2_HOST>:8080/actuator/health` 가 200 OK 반환할 때까지 최대 150초 대기

진행 상황은 `https://github.com/jin-0309/Whatap-Picker/actions` 에서 실시간 확인.

배포 완료 후:
```
브라우저로 http://<EC2_PUBLIC_IP>:8080/swagger-ui.html
또는      http://<EC2_PUBLIC_IP>:8080/actuator/health
```

---

## 4. 일상 운영

### 4.1 새 버전 배포

main에 push → 자동.

### 4.2 수동 배포 (특정 커밋으로)

GitHub Actions 화면에서 **Deploy to EC2** 워크플로우 → **Run workflow** → `image_tag` 입력란에 원하는 SHA 7자리 입력. 단, 그 SHA로 이미 한 번 빌드되어 GHCR에 올라가 있어야 함.

### 4.3 롤백

방법 A — 가장 간단:
```bash
# 로컬에서 이전 커밋 다시 push (revert)
git revert <bad-commit-sha>
git push origin main
```

방법 B — 즉시 (재빌드 없이):
GitHub Actions UI → **Run workflow** → `image_tag` 에 이전 SHA 입력 → Run.
(빌드 잡은 캐시 hit으로 빠르게 끝나고, deploy 잡이 해당 태그로 교체)

### 4.4 EC2 직접 확인

```bash
ssh -i ~/Downloads/picker-key.pem ec2-user@<EC2_PUBLIC_IP>

# 컨테이너 상태
cd /opt/whatap-picker
docker compose -f docker-compose.prod.yml ps

# 앱 로그
docker compose -f docker-compose.prod.yml logs -f app

# DB 접속
docker compose -f docker-compose.prod.yml exec postgres psql -U picker

# 디스크 / 메모리
df -h /
free -h
docker system df
```

### 4.5 EC2 재부팅 후

systemd로 docker가 자동 시작되고, `restart: unless-stopped` 정책으로 컨테이너도 자동 복귀합니다. `.env`와 `docker-compose.prod.yml`은 `/opt/whatap-picker/`에 남아 있어 별도 작업 불요.

---

## 5. 트러블슈팅

### 5.1 GHA `Pull image & restart on EC2` 단계가 SSH 실패

- 보안그룹에 GHA러너 IP 대역(전 세계)이 막혀있는지 확인 → 22번을 본인 IP만 막아두면 GHA가 접속 못함.
- 임시 해결: 22번 소스를 `0.0.0.0/0`으로 열되, 키 인증만 허용 (AL2023 기본 OK).
- 더 안전: GitHub Actions IP 대역에 한정 (https://api.github.com/meta 의 `actions` 항목)

### 5.2 헬스체크 실패 (`App did not become healthy within 150s`)

EC2 SSH 접속 후:
```bash
docker compose -f /opt/whatap-picker/docker-compose.prod.yml logs --tail 100 app
```

자주 보이는 원인:
- **OOM**: `free -h`로 swap 활성 확인. swap도 다 쓰면 JVM 힙 더 줄여야 함 (`JAVA_TOOL_OPTIONS` 의 `MaxRAMPercentage=50`).
- **DB 연결 실패**: `postgres` 컨테이너 healthy 인지 확인. 비밀번호 불일치면 `down -v` 후 재시작 (데이터 손실 주의).
- **Spring AI Ollama 부팅 실패**: 다른 세션에서 작업 중인 백엔드 코드가 Ollama를 강하게 의존하면 부팅 실패 가능. 이 경우 `application.yml`에 `spring.ai.ollama.init.pull-model-strategy=never` + LLM 호출부에 try/catch 또는 `@ConditionalOnProperty` 가드 추가 필요.

### 5.3 디스크 풀 (`no space left on device`)

```bash
ssh -i ~/Downloads/picker-key.pem ec2-user@<EC2_PUBLIC_IP>
docker system df
docker image prune -af
docker volume ls   # postgres_data는 절대 삭제 금지
sudo journalctl --vacuum-time=3d
```

cron이 매일 새벽 4시 자동 정리하지만, 해커톤 중 빌드를 자주 돌리면 그 사이에 쌓일 수 있음.

### 5.4 GHCR pull 실패

Public repo + public image면 인증 불요지만, 패키지가 private으로 생성됐을 수 있음.

```
https://github.com/jin-0309?tab=packages
→ whatap-picker → Package settings → Change visibility → Public
```

---

## 6. 보안 체크리스트

- [ ] `EC2_SSH_KEY`는 Secrets에만 두고 repo에 절대 커밋 안 함 (`.gitignore` 확인)
- [ ] `.env` 파일은 EC2의 `/opt/whatap-picker/.env` 에만 존재, repo에는 안 들어감
- [ ] `JWT_SECRET`은 최소 32바이트
- [ ] `BOOTSTRAP_ADMIN_PASSWORD`는 강한 비밀번호 (12자 이상 + 영문 대소문자 + 숫자 + 특수문자)
- [ ] SSH 포트(22)는 본인 IP나 GHA IP 대역만 허용 (가능하면)
- [ ] 데모 종료 후 인스턴스 stop 또는 보안그룹 8080 닫기
- [ ] 6개월마다 EC2 키 페어 회전 권장

---

## 7. 비용 (참고)

t3.micro는 AWS 프리티어 1년 750h/월 무료. 그 이후:
- EC2 t3.micro: ~$8/월 (서울 리전, 항상 켜둘 때)
- EBS 8GB gp3: ~$1/월
- 데이터 전송: 인바운드 무료, 아웃바운드 월 1GB까지 무료

데모용으로 사용 후 stop 해두면 EBS 비용만 발생.

---

*변경 이력*

| 일자 | 내용 |
| --- | --- |
| 2026-05-28 | 초안 — t3.micro / AL2023 / 8GB 기준, GHA + GHCR + SSH 배포 |
