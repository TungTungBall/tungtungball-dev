-- US-01 후속 S02 조회용 버전. 실제 Supabase 적용·S03 수정 정책은 별도 검토한다.
-- 기존 S01 INSERT 컬럼과 응답은 유지한다. 사용자는 version을 INSERT/UPDATE하지 못한다.
alter table public.survey_submissions
  add column version bigint not null default 1,
  add constraint survey_submissions_version_positive check (version > 0);

comment on column public.survey_submissions.version is
  '사전조사 저장 버전. S02에서 조회한다. S03의 원자적 수정·증가 방식은 후속 설계 대상이다.';
