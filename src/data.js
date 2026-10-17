// Official round definitions. The database (public.rounds, migration 20261017090000) holds the
// same maxima; tests/unit/schema-contract.test.js checks the two stay identical.
const NOTES = { key:'notes', label:'Notes (optional)', placeholder:'Anything the judges should know…' };

export const ROUNDS = [
  { id: 1, name: 'Prompt Golf', short: 'Precision prompting', max: 25, minutes: 12,
    desc: 'Write a concise prompt that closely matches a target output while respecting constraints.',
    deliverable: 'Final prompt + generated output',
    fields: [
      { key:'prompt_text', label:'Prompt used', required:true, long:true, placeholder:'The exact prompt you ran…' },
      { key:'output_text', label:'Generated output', required:true, long:true, placeholder:'Paste the AI response…' },
      { key:'evidence_text', label:'Evidence of matching the target (optional)', long:true, placeholder:'Which constraints you met and how…' },
      NOTES
    ],
    criteria: [{name:'Target match and structure',max:15},{name:'Constraint compliance',max:5},{name:'Brevity and clarity',max:5}] },
  { id: 2, name: 'Guardrail Challenge', short: 'Test an AI boundary', max: 30, minutes: 13,
    desc: 'Test a fictional chatbot’s rules and document whether it follows its boundaries using harmless test cases.',
    deliverable: 'Test prompts + responses + analysis',
    responsible: 'Use harmless test cases against the fictional scenario only. Do not attack real systems, access unauthorized information or bypass real security controls.',
    fields: [
      { key:'prompt_text', label:'Test prompts', required:true, long:true, placeholder:'Each harmless test case you tried…' },
      { key:'output_text', label:'Observed AI responses', required:true, long:true, placeholder:'What the chatbot answered to each test…' },
      { key:'analysis_text', label:'Analysis: were the rules followed?', required:true, long:true, placeholder:'Evidence and explanation for each observation…' },
      NOTES
    ],
    criteria: [{name:'Quality of test design',max:10},{name:'Evidence and explanation',max:10},{name:'Responsible analysis',max:10}] },
  { id: 3, name: 'Artifact Forge', short: 'Build a mini web app', max: 35, minutes: 18,
    desc: 'Generate and test a small single-file HTML/CSS/JavaScript application using one main prompt and at most one debugging prompt.',
    deliverable: 'Prompt(s) + HTML file + local demo',
    localDemo: 'Your app only needs to run on your own laptop (open the HTML file, or http://localhost:PORT). Judges verify it at your seat — a localhost link cannot be opened from the judges’ computers, so do not paste one as evidence. Public hosting is not required.',
    fields: [
      { key:'prompt_text', label:'Main prompt (+ at most one debugging prompt)', required:true, long:true, placeholder:'Main prompt…\n\nDebug prompt (if used)…' },
      { key:'output_text', label:'What the app does and how you tested it', required:true, long:true, placeholder:'Features, what you clicked, what worked…' },
      { key:'artifact_filename', label:'HTML / project file name', required:true, placeholder:'e.g. pomodoro.html' },
      { key:'demo_details', label:'Local demo details', required:true, placeholder:'Seat/laptop and how to open it, e.g. “Seat 12 · open pomodoro.html in Chrome”' },
      { key:'evidence_url', label:'Screenshot link (optional, must be shareable — not localhost)', placeholder:'https://…' },
      NOTES
    ],
    criteria: [{name:'Working functionality',max:15},{name:'Required features',max:10},{name:'Usability and visual clarity',max:10}] },
  { id: 4, name: 'AI Survival Dilemma', short: 'Adapt under pressure', max: 40, minutes: 18,
    desc: 'Solve a fictional campus crisis and revise the plan after a surprise update changes one of the constraints.',
    deliverable: 'Initial plan + revised plan + risks',
    fields: [
      { key:'prompt_text', label:'Prompts used', required:true, long:true, placeholder:'Prompts you gave the AI…' },
      { key:'initial_plan', label:'Initial plan', required:true, long:true, placeholder:'Your plan before the surprise update…' },
      { key:'revised_plan', label:'Revised plan after the update', required:true, long:true, placeholder:'What changed and why…' },
      { key:'risks_mitigation', label:'Risks and mitigation steps', required:true, long:true, placeholder:'Risk → mitigation…' },
      { key:'output_text', label:'Key AI output (optional)', long:true, placeholder:'Relevant excerpt…' },
      NOTES
    ],
    criteria: [{name:'Accuracy and feasibility',max:15},{name:'Handling of constraints',max:10},{name:'Adaptation to update',max:10},{name:'Clarity and actionability',max:5}] }
];
export const MAX_TOTAL = ROUNDS.reduce((s,r)=>s+r.max,0);

// Defaults mirror public.event_settings; the live values come from the database.
export const EVENT_DEFAULTS = {
  event_name: 'Prompt Wars: AI Survival Arena',
  venue: 'ICT Classroom, GITAM University',
  starts_at: '2026-10-23T15:00:00+05:30',
  ends_at: '2026-10-23T17:00:00+05:30',
  team_min_size: 4,
  team_max_size: 5,
  teams_locked: false,
  leaderboard_visible: true,
  tie_break_rule: null
};

export const STATUSES = ['Submitted', 'Under review', 'Scored', 'Rejected'];
export const SUBMISSION_FIELDS = ['title','prompt_text','output_text','notes','analysis_text','evidence_text',
  'artifact_filename','demo_details','evidence_url','initial_plan','revised_plan','risks_mitigation'];
