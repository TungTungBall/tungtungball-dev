# 맨몸 운동 MediaPipe 관절 데이터

공개 운동 영상 58개 구간에서 추출한 14종, 13,778개 샘플 프레임을 담았다. 영상별 운동 ID, 원본, 라이선스와 SHA-256은 `*-clips.json`에 있고, 재생할 관절 좌표는 `*-landmarks.json.gz`에 있다. 원본 영상은 저장소에 포함하지 않는다.

| 운동 | 데이터 ID | 클립 | 샘플 프레임 |
| --- | --- | ---: | ---: |
| 푸시업 | `push_up` | 20 | 4,696 |
| 맨몸 스쿼트 | `squat` | 25 | 7,286 |
| 리버스 런지 | `lunge` | 2 | 470 |
| 버피 | `burpee` | 1 | 181 |
| 점핑잭 | `jumping_jack` | 1 | 46 |
| 크런치 | `crunch` | 1 | 198 |
| 윗몸일으키기 | `sit_up` | 1 | 147 |
| 턱 점프 | `tuck_jump` | 1 | 54 |
| 파워 점프 | `power_jump` | 1 | 152 |
| 교대 스플릿 스쿼트 점프 | `split_squat_jump` | 1 | 75 |
| 마운틴 클라이머 | `mountain_climber` | 1 | 210 |
| 플랭크 | `plank` | 1 | 24 |
| 사이드 플랭크 | `side_plank` | 1 | 41 |
| 베어 크롤 | `bear_crawl` | 1 | 198 |

## 출처와 라이선스

- `mendeley-*`는 Duddela Sai Prashanth, Priya Kamath, Rakshith Bhandary, S Ashlesh Pai, Pratham PN, Advith P, Abhishek Mashetty의 *A Multi-View Raw Video Dataset of Seven Fitness Exercises with Good/Bad Form Labels* v3에서 푸시업·스쿼트 영상을 골라 관절 좌표로 변환한 것이다. [원본 데이터셋](https://data.mendeley.com/datasets/kgbb3yn47p/3), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- `demo-*`는 Wikimedia Commons, 미국 CDC, 미 육군, 미 해병대의 시범 영상을 운동 구간별로 잘라 관절 좌표를 추출한 것이다. 클립별 저자, 원본 링크, 라이선스는 [시범 영상 목록](demo-clips.json)에 있다. 변환된 Taco fleur의 버피·점핑잭 클립에도 CC BY-SA 4.0을 적용한다. [버피 원본](https://commons.wikimedia.org/wiki/File:Burpee.webm), [점핑잭 원본](https://commons.wikimedia.org/wiki/File:Jumping_jacks_and_burpees.webm), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), [DVIDS 저작권 안내](https://www.dvidshub.net/about/copyright).

> The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.

Mendeley 표본은 참가자 8명의 측면 `good/bad`와 대각선 `good` 영상이다. 영상 내용이 같으면서 참가자나 자세 라벨이 다른 두 쌍은 모두 제외했다. 참가자가 겹치지 않도록 `calibration` 21개와 `holdout` 23개로 나눴다. `source_form`은 원 저자의 클립 단위 라벨이다. 시범 영상은 `reference`로 표기했으며, 푸시업·스쿼트 외 종목은 운동당 1~2개다.

## 데이터 형식

앱과 동일한 Pose Landmarker Lite 모델로 1명을 추적했다. 긴 변을 최대 720px로 줄이고, 원본 프레임의 순서를 유지하면서 초당 15개를 목표로 샘플링했다. `version: 1` 파일의 `clips`는 클립 ID와 `frames`를 포함한다. 프레임은 `[timestamp_ms, points]`이며 시각은 클립 시작 기준이다.

- 좌표 순서는 MediaPipe 인덱스 11(왼 어깨)부터 32(오른발 끝)까지다. 각 좌표는 `[worldX, worldY, worldZ, visibility, inFrame]`이다. 월드 좌표와 신뢰도는 소수점 4자리까지 저장한다. `inFrame`은 정규화한 가로·세로 위치가 모두 이미지 안이면 `1`이다.
- 자세를 놓친 프레임은 `[]`로 기록한다. 이 경우도 타임스탬프를 남긴다. 13,778개 샘플 중 관절 좌표가 있는 프레임은 13,254개다.

## 판정 재생

`repetition-checks.json`에 원본 영상을 보고 센 완전한 왕복 횟수와 검사 구간을 기록했다. 프로젝트의 `RepetitionCounter`로 측면 스쿼트 5개 구간에서 합계 18회를 재현했고, 플랭크 구간에서 스쿼트 0회를 확인했다. 이 구간은 고정된 규칙의 회귀 검사에 쓰인다. 촬영 환경별 정확도나 자세 품질은 이 검사에서 측정하지 않는다.

`healthmith-frontend`에서 실행한다.

```sh
pnpm exec vitest run tests/unit/pose-dataset.test.ts
POSE_REPETITION_RULES="$(cat datasets/pose/demo-rules.json)" pnpm dev
```

두 번째 명령은 기존 로컬 앱 설정을 이용해 측면 스쿼트 관절 규칙과 기존 푸시업 화면 움직임 판정을 사용한다. 시작할 루틴의 모든 운동에 등록된 판정 규칙이 필요하다. 런지, 플랭크 등은 이 데이터에서 시범 좌표로 제공한다. 지원 운동을 결정하는 DB 시드는 기존 방식으로 관리한다.

## 좌표 다시 생성하기

원본을 저장소 밖에 준비한다. `demo-clips.json`의 `source.download`에서 받은 파일은 각 항목의 `file` 이름으로 저장한다. Mendeley의 `Dataset Exercise-wise.zip`에서는 `mendeley-clips.json`의 `file` 경로에 해당하는 영상만 꺼내 같은 디렉터리에 파일명으로 저장한다. 추출기는 모든 입력 파일과 모델의 SHA-256을 확인한다.

```sh
pnpm prepare:pose
python3 -m venv /tmp/healthmith-pose-venv
/tmp/healthmith-pose-venv/bin/python -m pip install 'mediapipe==1.2.2' 'opencv-contrib-python==5.0.0.93'

# 마지막 인자는 생성할 파일의 경로다.
/tmp/healthmith-pose-venv/bin/python scripts/extract-pose-dataset.py \
  datasets/pose/mendeley-clips.json /path/to/videos /tmp/mendeley-landmarks.json.gz
/tmp/healthmith-pose-venv/bin/python scripts/extract-pose-dataset.py \
  datasets/pose/demo-clips.json /path/to/videos /tmp/demo-landmarks.json.gz
```
