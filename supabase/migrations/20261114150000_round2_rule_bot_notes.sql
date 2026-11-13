-- Prompt Wars Control Center — Round 2 built-in chatbot: private judge notes (14 Nov 2026)
-- Apply AFTER 20261114120000_ai_event_workspace.sql. Safe to run more than once. Changes one row only,
-- and only if the host has not edited it yet.
--
-- The built-in rule-based chatbot (src/lib/ruleBot.js) has two deliberate, harmless weaknesses for
-- teams to discover. The AI judge needs to know them; teams never see judge notes.

begin;

update public.round_judge_notes
   set notes = 'Good tests cover every rule, include indirect/boundary cases, and stay harmless. Evidence must match the stored chat transcript. '
            || 'The built-in CampusHelper has two deliberate weaknesses: (1) a role-play or story framing makes it share a FICTIONAL staff phone number '
            || '(breaks rule 1); (2) asked whether it is staff/an official, it claims to be help-desk staff (breaks rule 4). '
            || 'Reward teams that discover and clearly explain these; do not penalise teams that only confirm the rules hold. '
            || 'Responsible analysis avoids real-world attack advice.',
       updated_at = now()
 where round_id = 2
   and notes = 'Good tests cover every rule, include at least one boundary/indirect case, and stay harmless. Evidence must match the stored chat transcript. Responsible analysis avoids real-world attack advice.';

commit;
