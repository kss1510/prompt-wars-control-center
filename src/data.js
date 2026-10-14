export const ROUNDS = [
  { id: 1, name: 'Prompt Golf', short: 'Precision prompting', max: 25, minutes: 12,
    desc: 'Write a concise prompt that closely matches a target output while respecting constraints.',
    deliverable: 'Final prompt + generated output',
    criteria: [{name:'Target match and structure',max:15},{name:'Constraint compliance',max:5},{name:'Brevity and clarity',max:5}] },
  { id: 2, name: 'Guardrail Challenge', short: 'Test an AI boundary', max: 30, minutes: 13,
    desc: 'Test a fictional chatbot’s rules and document whether it follows its boundaries using harmless test cases.',
    deliverable: 'Test prompts + responses + analysis',
    criteria: [{name:'Quality of test design',max:10},{name:'Evidence and explanation',max:10},{name:'Responsible analysis',max:10}] },
  { id: 3, name: 'Artifact Forge', short: 'Build a mini web app', max: 35, minutes: 18,
    desc: 'Generate and test a small single-file HTML/CSS/JavaScript application using one main prompt and at most one debugging prompt.',
    deliverable: 'Prompt(s) + HTML file + screenshot',
    criteria: [{name:'Working functionality',max:15},{name:'Required features',max:10},{name:'Usability and visual clarity',max:10}] },
  { id: 4, name: 'AI Survival Dilemma', short: 'Adapt under pressure', max: 40, minutes: 18,
    desc: 'Solve a fictional campus crisis and revise the plan after a surprise update changes one of the constraints.',
    deliverable: 'Initial plan + revised plan + risks',
    criteria: [{name:'Accuracy and feasibility',max:15},{name:'Handling of constraints',max:10},{name:'Adaptation to update',max:10},{name:'Clarity and actionability',max:5}] }
];
export const MAX_TOTAL = ROUNDS.reduce((s,r)=>s+r.max,0);