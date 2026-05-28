import type { PickerCell } from "@/PickerCanvas";
import type { LeadSearchItem } from "@/lib/draw-api";

export type Prize = {
  rank: string;
  name: string;
  count: number;
};

export type PickResult = {
  id: string;
  cellNumber: number;
  rank: string;
  name: string;
  pickedAt: string;
  participantName?: string;
  participantPhoneLastFour?: string;
};

export type PickerState = {
  eventCode?: string;
  eventTitle: string;
  prizes: Prize[];
  cells: PickerCell[];
  results: PickResult[];
};

export type ParticipantForm = {
  lastName: string;
  firstName: string;
  phoneLastFour: string;
};

export type Participant = {
  leadId?: string;
  name: string;
  phoneLastFour: string;
  eventCode?: string;
  eventDate?: string;
  company?: string;
  jobLevel?: string;
  aiStatus?: LeadSearchItem["aiStatus"];
  grade?: LeadSearchItem["grade"];
  score?: LeadSearchItem["score"];
};

export type LeadOption = LeadSearchItem & {
  eventCode: string;
  eventDate: string;
};

export type PickerView = "entry" | "admin" | "draw";
export type PickedCellsByEvent = Record<string, number[]>;
