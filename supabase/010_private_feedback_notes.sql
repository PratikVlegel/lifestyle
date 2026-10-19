-- Private free-text feedback remains in local app storage. Community members
-- may read structured ratings and public comments, but not the legacy `note`.
begin;

revoke select on public.prep_reviews from public, anon, authenticated;
grant select (
  id, shared_id, taste, ease, portion, eat, fullness, keep, again,
  created_by, created_at, rating, community_comment, updated_at
) on public.prep_reviews to authenticated;

commit;
