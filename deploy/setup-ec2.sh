#!/usr/bin/env bash
# WhaTap Picker — Amazon Linux 2023 t3.micro 초기 세팅 (1회 실행)
#
# 사용법:
#   1) EC2에 SSH 접속 (ec2-user)
#   2) curl 또는 scp로 본 스크립트를 EC2에 복사
#   3) bash setup-ec2.sh
#
# 이 스크립트는 docker/compose 설치, 2GB swap 추가, 디렉토리 생성, 디스크 보호 cron 등록만 합니다.
# 시크릿/.env는 GitHub Actions 배포 시 자동으로 주입됩니다.

set -euo pipefail

if [ "$EUID" -eq 0 ]; then
    echo "❌ root가 아닌 ec2-user로 실행하세요. (스크립트 내부에서 sudo 사용)"
    exit 1
fi

echo "==> [1/6] 시스템 패키지 업데이트"
sudo dnf -y update

echo "==> [2/6] Docker + cron 설치 및 부팅 시 자동 시작"
# AL2023 기본 이미지에는 cron이 없어서 같이 설치 (step 6에서 사용)
sudo dnf -y install docker cronie
sudo systemctl enable --now docker
sudo systemctl enable --now crond
sudo usermod -aG docker "$USER"

echo "==> [3/6] docker compose plugin 설치"
if ! docker compose version >/dev/null 2>&1; then
    DOCKER_CONFIG="${DOCKER_CONFIG:-/usr/local/lib/docker}"
    sudo mkdir -p "${DOCKER_CONFIG}/cli-plugins"
    sudo curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64" \
        -o "${DOCKER_CONFIG}/cli-plugins/docker-compose"
    sudo chmod +x "${DOCKER_CONFIG}/cli-plugins/docker-compose"
fi

echo "==> [4/6] 2GB swap 추가 (t3.micro RAM 1GB 보강)"
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    # 메모리 압박 시 swap 사용 줄이기 (Postgres 성능 보호)
    echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf >/dev/null
    sudo sysctl -p /etc/sysctl.d/99-swappiness.conf
else
    echo "    swap 이미 존재 — 건너뜀"
fi

echo "==> [5/6] /opt/whatap-picker 디렉토리 생성"
sudo mkdir -p /opt/whatap-picker
sudo chown "$USER:$USER" /opt/whatap-picker
sudo chmod 750 /opt/whatap-picker

echo "==> [6/6] 일일 docker 이미지 정리 cron (8GB 디스크 보호)"
CRON_LINE='0 4 * * * /usr/bin/docker image prune -af --filter "until=24h" >> /var/log/docker-prune.log 2>&1'
( sudo crontab -l 2>/dev/null | grep -vF "docker image prune" ; echo "$CRON_LINE" ) | sudo crontab -

echo ""
echo "✅ 초기 세팅 완료."
echo ""
echo "다음 단계:"
echo "  1) 로그아웃 후 재접속 (docker 그룹 권한 적용)"
echo "     exit  →  ssh 다시 접속  →  docker ps  로 권한 확인"
echo "  2) AWS 콘솔에서 보안그룹 인바운드 규칙 추가:"
echo "       - TCP 22  (SSH, 본인 IP만 권장)"
echo "       - TCP 8080 (앱, 데모 시 0.0.0.0/0 또는 사내망)"
echo "  3) GitHub repo Settings → Secrets and variables → Actions 에 다음 3개만 등록:"
echo "       EC2_HOST     (EC2 퍼블릭 IP)"
echo "       EC2_USER     (ec2-user)"
echo "       EC2_SSH_KEY  (.pem 파일 전체 내용)"
echo "     나머지 JWT/Postgres/admin 비번은 첫 배포 시 EC2가 자동 생성합니다."
echo "  4) main 브랜치에 push → GitHub Actions가 자동 빌드·배포"
echo "  5) 첫 배포 후 EC2에 다시 SSH 접속해서 어드민 비밀번호 확인:"
echo "       cat /opt/whatap-picker/.secrets/admin_password"
echo ""
echo "현재 디스크/메모리 상태:"
df -h /
free -h
