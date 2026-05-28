import type { FormEvent } from "react";
import { ArrowRight, Phone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LeadOption, ParticipantForm } from "@/picker/types";

type ParticipantEntryPageProps = {
  participantForm: ParticipantForm;
  participantError: string;
  prizeStatus: string;
  eventCode: string;
  isAdminSpecialAccountEntered: boolean;
  leadOptions: LeadOption[];
  isCheckingParticipant: boolean;
  canSubmitParticipant: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onParticipantFieldChange: (field: keyof ParticipantForm, value: string) => void;
  onSelectLead: (lead: LeadOption) => void;
};

export function ParticipantEntryPage({
  participantForm,
  participantError,
  prizeStatus,
  eventCode,
  isAdminSpecialAccountEntered,
  leadOptions,
  isCheckingParticipant,
  canSubmitParticipant,
  onSubmit,
  onParticipantFieldChange,
  onSelectLead,
}: ParticipantEntryPageProps) {
  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-background px-5 pb-5 pt-4">
      <header className="flex h-[92px] shrink-0 items-center justify-between gap-4">
        <div className="w-[180px]" aria-hidden="true" />
        <img
          src="/WhaTap_basic_logo.png"
          alt="WhaTap"
          className="h-[48px] w-auto object-contain"
        />
        <div className="w-[180px]" aria-hidden="true" />
      </header>

      <section className="flex min-h-0 flex-1 items-center justify-center">
        <form
          className="w-full max-w-[420px] rounded-lg border bg-card p-6 shadow-sm"
          onSubmit={onSubmit}
        >
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-normal text-foreground">제출하신 설문 정보를 입력해 주세요.</h1>
            {prizeStatus ? (
              <p className="mt-2 text-sm font-medium text-muted-foreground">{prizeStatus}</p>
            ) : null}
          </div>

          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
              <div className="space-y-2">
                <Label htmlFor="participant-last-name">성</Label>
                <div className="relative">
                  <UserRound
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="participant-last-name"
                    value={participantForm.lastName}
                    onChange={(event) => onParticipantFieldChange("lastName", event.target.value)}
                    placeholder="홍"
                    className="h-12 pl-9 text-base"
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="participant-first-name">이름</Label>
                <Input
                  id="participant-first-name"
                  value={participantForm.firstName}
                  onChange={(event) => onParticipantFieldChange("firstName", event.target.value)}
                  placeholder="길동"
                  className="h-12 text-base"
                  autoComplete="given-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="participant-phone-last-four">전화번호 뒷자리</Label>
              <div className="relative">
                <Phone
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="participant-phone-last-four"
                  value={participantForm.phoneLastFour}
                  onChange={(event) => onParticipantFieldChange("phoneLastFour", event.target.value)}
                  placeholder="1234"
                  className="h-12 pl-9 text-base"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="tel"
                />
              </div>
            </div>
          </div>

          {participantError ? (
            <p className="mt-4 text-sm font-medium text-destructive">{participantError}</p>
          ) : null}
          {!eventCode && !isAdminSpecialAccountEntered ? (
            <p className="mt-4 text-sm font-medium text-destructive">
              행사를 먼저 선택해주세요.
            </p>
          ) : null}

          {leadOptions.length > 0 ? (
            <div className="mt-4 space-y-2">
              {leadOptions.map((lead) => (
                <Button
                  key={lead.leadId}
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-between gap-3 px-4 py-3 text-left"
                  onClick={() => onSelectLead(lead)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{lead.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {lead.company} · {lead.jobLevel}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {lead.drawn ? "추첨 완료" : lead.grade ? `${lead.grade} · ${lead.score ?? "-"}점` : lead.aiStatus}
                  </span>
                </Button>
              ))}
            </div>
          ) : null}

          <Button type="submit" className="mt-6 h-12 w-full gap-2 text-base" disabled={!canSubmitParticipant}>
            {isCheckingParticipant ? "확인 중" : "이벤트 참여하기"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </section>
    </main>
  );
}
