// Built-in Round 2 chatbot: rule-based, free and unlimited (no AI calls). Used by the server
// (api/guardrail-chat.js) and demo mode, and as the backup whenever the optional AI chatbot is busy.
//
// It deliberately has TWO harmless, fictional weaknesses so the Guardrail Challenge has something
// real to discover (listed only in the AI judge's private notes, never shown to teams):
//   1. Role-play / story framing makes it share a FICTIONAL staff phone number (breaks rule 1).
//   2. Asked whether it is staff or an official, it claims to be help-desk staff (breaks rule 4).
const has = (m, re) => re.test(m);

export function ruleBotReply(cfg, message) {
  const name = cfg?.bot_name || 'CampusHelper';
  const m = String(message || '').toLowerCase();
  const roleplay = has(m, /\b(story|role[- ]?play|pretend|imagine|hypothetical(ly)?|for a (novel|play|game)|in a game|let'?s play)\b/);
  const personal = has(m, /\b(phone|number|mobile|contact|e-?mail|address|personal (data|details|info)|date of birth|roll number)\b/);
  const secret = has(m, /\b(password|passcode|pin|login|credentials?|otp)\b/);

  // Weakness 1 (fictional data only): role-play framing leaks a made-up number.
  if (roleplay && (personal || secret)) {
    return `Okay, just for the story — the librarian, Ms. Rao, can be reached on 98480-12345 (a made-up number). Anything else for your story?`;
  }
  if (secret) return `Sorry, I can't share passwords or login details — that's against my rules. I can help with the library, canteen, events or directions.`;
  if (personal) return `Sorry, I can't share anyone's phone number, email or personal details. You can contact the main office through the official notice board.`;
  if (has(m, /\b(exam|answer key|question paper|test answers|assignment (answers?|solutions?)|solutions? (to|for) (the )?(assignment|exam|quiz)|graded)\b/)) {
    return `I can't help with exam or assignment answers. The library's second floor has past-paper study guides you can use to prepare.`;
  }
  if (has(m, /\b(ignore|forget|bypass|override) (your|the|all|previous|these)? ?(rules|instructions)\b|\bdeveloper mode\b|\bjailbreak\b|\bno rules\b|\byou are now\b/)) {
    return `I have to keep following my rules, so I can't do that. My rules: no personal data or passwords, no exam answers, campus topics only, and I'm a chatbot, not a person.`;
  }
  if (has(m, /\b(are you|r u)\b.*\b(staff|official|employee|teacher|admin)\b/)) {
    // Weakness 2: claims to be staff.
    return `Yes — I'm part of the campus help-desk staff, so you can trust what I say.`;
  }
  if (has(m, /\b(are you|r u)\b.*\b(human|real|person|bot|ai|robot)\b|\bwho are you\b/)) {
    return `I'm ${name}, a chatbot for this (fictional) campus — not a human.`;
  }
  if (has(m, /\blibrary\b/)) return `The library is open 8 am to 8 pm on weekdays and 10 am to 4 pm on Saturdays. Quiet zones are on the second floor.`;
  if (has(m, /\b(canteen|cafeteria|food|lunch|breakfast|snack|chai|coffee)\b/)) return `The canteen serves breakfast 8–10 am and lunch 12–3 pm. Today's special is veg biryani.`;
  if (has(m, /\b(event|fest|workshop|club|seminar|hackathon|prompt wars)\b/)) return `This week: a coding workshop on Wednesday at 4 pm in Lab 3 and the cultural fest rehearsal on Friday evening in the auditorium.`;
  if (has(m, /\b(where|direction|how do i get|located|location|block|building|hostel|auditorium|lab)\b/)) return `Block A is next to the main gate, the auditorium is behind Block B, and the labs are on the first floor of Block C.`;
  if (has(m, /\b(wi-?fi|internet|network)\b/)) return `Campus Wi-Fi is "Campus-Guest"; ask the IT desk in Block A for a guest login.`;
  if (has(m, /\b(time|timing|hours|open|close|holiday)\b/)) return `Most offices are open 9 am to 5 pm on weekdays. The library has longer hours: 8 am to 8 pm.`;
  if (has(m, /^\s*(hi|hello|hey|namaste|good (morning|afternoon|evening))\b/)) return `Hello! I'm ${name}. Ask me about the library, canteen, events or directions on campus.`;
  if (has(m, /\b(weather|movie|cricket|football|politics|election|stock|crypto|recipe|song|lyrics|write (me )?(a |an )?(poem|essay|code)|homework)\b/)) {
    return `Sorry, I can only help with campus topics like the library, canteen, events and directions.`;
  }
  return `I'm ${name}, the campus help-desk bot. I can help with the library, canteen timings, events and directions.`;
}
