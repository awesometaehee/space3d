import type { Booking, DateKey, DayPeriod, Slot } from '../../../data/meetingRooms';
import type { ToolDefinition } from '../../agui';

/**
 * 회의실 예약 영역의 화면 도구.
 * 에이전트는 이 도구를 "호출"할 뿐이고, 무엇을 어떻게 그릴지는 프론트엔드가 정한다.
 */

export interface RoomOption {
  id: string;
  name: string;
  capacity: number;
  equipment: string[];
  /** 요청 인원이 들어가는지 */
  fits: boolean;
  /** 요청 시간대에 비어 있는 후보 수 */
  freeSlots: number;
}

export interface ShowRoomOptionsArgs {
  date: DateKey;
  dateLabel: string;
  period: DayPeriod;
  people: number;
  durationMin: number;
  rooms: RoomOption[];
}
export type ShowRoomOptionsResult = { roomId: string } | { cancelled: true };

export interface ShowTimeSlotsArgs {
  roomId: string;
  roomName: string;
  date: DateKey;
  dateLabel: string;
  durationMin: number;
  slots: Slot[];
}
export type ShowTimeSlotsResult = { start: string; end: string } | { back: true } | { cancelled: true };

export interface ConfirmBookingArgs {
  roomId: string;
  roomName: string;
  date: DateKey;
  dateLabel: string;
  start: string;
  end: string;
  people: number;
  title: string;
}
export type ConfirmBookingResult = { confirmed: true; title: string } | { confirmed: false };

export interface ShowBookingResultArgs {
  booking: Booking;
  roomName: string;
  dateLabel: string;
}

export const ROOM_TOOL = {
  showRoomOptions: 'show_room_options',
  showTimeSlots: 'show_time_slots',
  confirmBooking: 'confirm_booking',
  showBookingResult: 'show_booking_result',
} as const;

export const ROOM_DISPLAY_ONLY = [ROOM_TOOL.showBookingResult];

export const ROOM_TOOLS: ToolDefinition[] = [
  {
    name: ROOM_TOOL.showRoomOptions,
    description: '조건에 맞는 회의실 후보를 카드로 보여 주고, 사용자가 고른 회의실 id를 돌려받는다.',
    parameters: { type: 'object', required: ['date', 'people', 'rooms'] },
  },
  {
    name: ROOM_TOOL.showTimeSlots,
    description: '선택한 회의실의 시간대 후보를 버튼으로 보여 주고, 고른 시간을 돌려받는다.',
    parameters: { type: 'object', required: ['roomId', 'date', 'slots'] },
  },
  {
    name: ROOM_TOOL.confirmBooking,
    description: '예약 내용을 보여 주고 사용자의 최종 확인(예약/취소)을 받는다.',
    parameters: { type: 'object', required: ['roomId', 'date', 'start', 'end'] },
  },
  {
    name: ROOM_TOOL.showBookingResult,
    description: '완료된 예약을 요약 카드로 보여 준다.',
    parameters: { type: 'object', required: ['booking'] },
  },
];
