-- Calendar notes/reminders don't have to belong to a house.
alter table public.reminders alter column job_id drop not null;
