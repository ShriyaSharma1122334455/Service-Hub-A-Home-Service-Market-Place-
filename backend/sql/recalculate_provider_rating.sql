create or replace function public.recalculate_provider_rating(provider_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.providers
  set
    rating_avg = coalesce((
      select round(avg(r.rating)::numeric, 2)
      from public.reviews r
      where r.provider_id = recalculate_provider_rating.provider_id
    ), 0),
    rating_count = (
      select count(*)
      from public.reviews r
      where r.provider_id = recalculate_provider_rating.provider_id
    )
  where id = recalculate_provider_rating.provider_id;
end;
$$;
