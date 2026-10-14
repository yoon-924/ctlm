# CTLM Fit Lab

Keithley 측정 엑셀을 브라우저에서 읽고 CTLM 접촉 비저항을 추출하는 정적 웹 도구입니다. 로그인·서버·빌드 과정이 필요하지 않습니다. 파일과 계산 결과는 이 기기의 브라우저 안에서 처리되며 외부 서버로 전송하지 않습니다. 모든 라이브러리를 포함하므로 오프라인에서도 사용할 수 있습니다.

## 바로 사용

`dist/index.html`을 Chrome 또는 Edge에서 여세요. 함께 제공된 단일 HTML 버전도 사용할 수 있습니다. 첫 화면에는 합성 예제가 표시됩니다. 실제 측정 파일이 아닙니다.

1. `.xlsx`, `.xls`, `.csv` 측정 파일을 선택합니다.
2. 안쪽 원형 전극의 **반지름**과 각 패턴의 간격을 μm로 입력합니다.
3. 전류 열, 전압 열, 원본 전류·전압 단위를 확인합니다.
4. 결과 Excel, 분석 JSON 또는 저항–간격 그래프 SVG를 저장합니다.

기본 패턴 매핑은 기존 실험 기준입니다: Data 60, Append1 40, Append2 20, Append3 15, Append4 10, Append5 5 μm. 다른 패턴은 실제 치수를 직접 입력해야 합니다. 반지름 기본값은 80 μm입니다. 이 값들을 확인하지 않고 다른 시료에 적용하지 마세요.

## 입력과 계산

- 첫 35행 안에서 `I1`/`Current` 및 `V2`, `V3`, `VPROBE`, `Voltage` 등의 열을 찾습니다. 측정 열이 없는 Settings/Calc 시트는 제외합니다.
- 각 측정 시트가 하나의 간격을 나타냅니다. `원본 시트`/`Sheet`/`Pattern` 열이 있는 통합 표는 그룹별로 분리합니다.
- V2·V3가 있으면 V2−V3를 우선 사용합니다. VPROBE만 있으면 부호를 보존해 피팅하고 기울기의 크기를 저항으로 사용합니다. V1은 공급 단자 전압일 수 있으므로 센스 전압인지 확인해야 합니다.
- I–V: `V = a I + b`, 자유 절편 OLS, `R = |a|`. 전압을 점마다 절댓값으로 바꾸거나 V/I를 평균하지 않습니다.
- 동일 가중치가 기본입니다. 선택적으로 I–V 기울기 표준오차의 역분산 가중치를 적용합니다. 이 오차는 반복 시료·치수의 불확도를 대신하지 않습니다.
- CTLM: 수정 베셀 함수 I0/I1와 K0/K1을 포함한 방사형 모델을 피팅합니다. I비율은 급수/점근식, K비율은 스케일된 적분의 64점 Gauss–Legendre 구적으로 계산합니다.
- Rsh는 주어진 LT에서 해석적으로 최적화하고, 양의 LT의 로그 공간을 전역 격자로 탐색한 뒤 골든 섹션으로 최소화합니다. LT 탐색 범위는 반지름의 1E−5~100배이며 경계 해는 표시합니다.
- 접촉 비저항 `rho = Rsh * (LT_um * 1E-4)^2`, 단위 Ω·cm². 막 두께는 사용하지 않습니다.
- 보정 근사: `c = (r0/s) ln(1+s/r0)`, `R/c = m*s+b`, `Rsh=2*pi*r0*m`, `LT=b/(2*m)`.
- 두 모델의 비교 R²는 **원래 저항 축**으로 계산합니다. 보정 축 R²는 결과 Excel에 별도로 기록합니다.
- 최소 3개 패턴·서로 다른 3개 간격이 필요합니다. 치수 누락·유효하지 않은 I–V는 결과를 차단합니다. 패턴을 자동으로 제외하지 않습니다.
- 결과 Excel은 현재 입력의 **계산값 스냅샷**이며 라이브 수식/차트를 포함하지 않습니다. 치수가 바뀌면 웹 도구에서 다시 피팅하세요. 그래프는 별도 SVG로 저장합니다.
- 표준오차는 잔차로 스케일한 국소 공분산과 파라미터 상관을 이용합니다. 모델 오차·치수 오차를 포함한 총 불확도나 보장된 신뢰구간이 아닙니다.

## 모델의 가정

오믹 응답, 무시할 수 있는 금속 저항, 접촉 아래와 전극 사이의 동일한 반도체 면저항, 충분히 넓은 바깥 전극을 가정합니다. 유한한 바깥 전극 폭, 비균일 접촉, 다중 전도 경로, 비선형 접촉은 별도 모델/측정이 필요할 수 있습니다. r0/LT < 4일 때 보정 근사의 여유가 부족할 수 있으나, 베셀 원식 자체를 사용할 수 없다는 뜻은 아닙니다.

## GitHub Pages 배포

단일 HTML 파일만 사용한다면 파일 이름을 `index.html`로 바꿔 저장소 루트에 올리고, **Settings → Pages → Source → Deploy from a branch → main / (root)**를 선택할 수 있습니다. [GitHub 공식 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

수정하기 쉬운 분리된 소스 버전은 다음 절차로 배포합니다.

이 디렉터리의 파일을 GitHub 저장소에 올립니다. `.github/workflows/pages.yml`도 포함하세요.

1. 저장소의 기본 브랜치를 `main`으로 사용합니다. 다른 브랜치라면 `pages.yml`의 branch 값을 바꾸세요.
2. **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
3. `main`에 push하거나 **Actions → Deploy CTLM Fit Lab to GitHub Pages → Run workflow**를 실행합니다.
4. 완료되면 Pages 주소로 접속합니다. 일반적으로 `https://사용자명.github.io/저장소명/`입니다.

웹 화면과 합성 예제만 배포됩니다. 측정 파일은 저장소에 올릴 필요가 없습니다. 테스트에 사용한 실제 측정 데이터는 이 프로젝트에 포함하지 않았습니다.

## 검증

Node.js가 있다면 의존성 설치 없이 실행합니다.

```sh
node tests/test-engine.cjs
```

선택적으로 로컬 Keithley 파일로 종단 간 계산을 검사합니다. 이 명령은 파일을 외부로 보내지 않습니다.

```sh
node tests/test-engine.cjs "측정파일.xlsx"
```

## 출처와 라이선스

- 원식: G. S. Marlow, M. B. Das (1982), *Solid-State Electronics* 25(2), 91–94. DOI: [10.1016/0038-1101(82)90036-3](https://doi.org/10.1016/0038-1101(82)90036-3).
- 원형 보정식: 사용자 제공 CTLM_Cor_Factor.pdf의 식 (2), (3).
- 관련 MATLAB 프로젝트: [maciejkozubal/cTLM](https://github.com/maciejkozubal/cTLM). 이 도구의 엔진은 해당 코드를 복사하지 않은 독립 구현입니다.
- Excel 입출력: SheetJS Community Edition 0.20.3, Apache-2.0. 공식 배포본을 `dist/vendor`에 포함했으며 원래 라이선스를 함께 제공합니다.
- 이 프로젝트의 독립 코드: MIT, `LICENSE` 참조. 수치 결과는 위 적용 조건을 확인하여 사용하세요.
