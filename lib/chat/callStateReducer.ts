export type CallUiState =
  | "idle"
  | "outgoing-ringing"
  | "incoming-ringing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "failed";

export type CallUiAction =
  | { type: "CALL_STARTED" }
  | { type: "INCOMING_RING" }
  | { type: "JOINED" }
  | { type: "MEDIA_CONNECTED" }
  | { type: "RECONNECTING" }
  | { type: "REMOTE_ENDED" }
  | { type: "LOCAL_ENDED" }
  | { type: "FAILURE" }
  | { type: "RESET" }
  | { type: "FORCE_STATE"; next: CallUiState };

function canTransition(from: CallUiState, to: CallUiState) {
  if (from === to) return true;
  if (to === "idle") return true;
  if (from === "ended") return false;
  if (from === "failed" && to === "connected") return false;
  return true;
}

export function callStateReducer(state: CallUiState, action: CallUiAction): CallUiState {
  let next: CallUiState = state;
  switch (action.type) {
    case "CALL_STARTED":
      next = "outgoing-ringing";
      break;
    case "INCOMING_RING":
      next = "incoming-ringing";
      break;
    case "JOINED":
      next = "connecting";
      break;
    case "MEDIA_CONNECTED":
      next = "connected";
      break;
    case "RECONNECTING":
      next = "reconnecting";
      break;
    case "REMOTE_ENDED":
    case "LOCAL_ENDED":
      next = "ended";
      break;
    case "FAILURE":
      next = "failed";
      break;
    case "RESET":
      next = "idle";
      break;
    case "FORCE_STATE":
      next = action.next;
      break;
    default:
      next = state;
  }
  return canTransition(state, next) ? next : state;
}
