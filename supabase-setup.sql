-- ============================================================
-- 클린업데이 포토제닉 — Supabase 초기 설정
-- Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 Run 한 번이면 끝.
-- ============================================================

-- 1) 게시물 테이블
create table if not exists public.posts (
  id uuid primary key,
  nickname text not null check (char_length(nickname) between 1 and 20),
  memo text not null default '' check (char_length(memo) <= 200),
  image_path text not null,
  width int not null default 4,
  height int not null default 3,
  reactions jsonb not null default '{"museum":0,"dino":0,"magic":0,"box":0,"shine":0,"zero":0}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- 누구나 읽기/쓰기 가능 (사내 이벤트용), 수정·삭제는 불가
drop policy if exists "anon read posts" on public.posts;
create policy "anon read posts" on public.posts for select using (true);

drop policy if exists "anon insert posts" on public.posts;
create policy "anon insert posts" on public.posts for insert with check (true);

-- 2) 반응 카운트 원자적 증가/감소 (RLS 우회는 이 함수로만)
create or replace function public.increment_reaction(post_id uuid, reaction_key text, delta int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_reactions jsonb;
  d int;
begin
  if reaction_key not in ('museum','dino','magic','box','shine','zero') then
    raise exception 'invalid reaction key';
  end if;
  d := case when delta = -1 then -1 else 1 end;

  update public.posts
     set reactions = jsonb_set(
       reactions,
       array[reaction_key],
       to_jsonb(greatest(0, coalesce((reactions->>reaction_key)::int, 0) + d))
     )
   where id = post_id
   returning reactions into new_reactions;

  return new_reactions;
end;
$$;

grant execute on function public.increment_reaction(uuid, text, int) to anon;

-- 3) 사진 저장 버킷 (공개 읽기, 2MB 제한, 이미지만)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "anon upload photos" on storage.objects;
create policy "anon upload photos"
  on storage.objects for insert to anon
  with check (bucket_id = 'photos');
