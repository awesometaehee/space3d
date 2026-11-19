# space3d 문서

복셀 오피스 디오라마 위에서 AG-UI 에이전트로 그룹웨어 업무를 처리하는 PoC입니다.

| 문서 | 내용 |
|---|---|
| [agent-architecture.md](agent-architecture.md) | AG-UI 구조: 이벤트 흐름, 카드 카탈로그, 업무 영역(도메인) 구조, 복셀 연동, 안전 원칙 |
| [groupware-tasks.md](groupware-tasks.md) | 에이전트로 처리할 그룹웨어 업무 목록, 우선순위, 다루지 않는 정보 |
| [domains/meeting-room.md](domains/meeting-room.md) | 회의실 예약 (구현됨) |
| [domains/schedule.md](domains/schedule.md) | 일정 조율 (구현됨) |
| [domains/approval.md](domains/approval.md) | 전자결재 (구현됨) |
| [ui-streaming-reply.md](ui-streaming-reply.md) | 답변 말풍선 스트리밍 애니메이션과 스프링 값 |

## 실행

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # vitest
npm run build   # 타입 검사 + 번들
```

## 현재 상태

- 에이전트는 **모의 에이전트**입니다. LLM 없이 규칙으로 요청을 해석하지만, 실제 에이전트와 같은 AG-UI 이벤트를 주고받습니다.
- 회의실, 결재 문서, 조직도·일정, 구성원 정보는 모두 **가상 데이터**입니다. 실제 임직원·거래처 정보가 아닙니다.
- 데이터는 메모리에만 있어서 새로 고치면 처음 상태로 돌아갑니다.
