# DKS-Client docker를 사용한 개발 환경 구축 가이드

## 🛠️ 필수 소프트웨어 설치

### 1. Docker Desktop 설치
1. [Docker 설치 가이드](https://herojoon-dev.tistory.com/254)

### 2. Android Studio 및 ADB 설치
1. [Android Studio 설치 가이드](https://joo-selfdev.tistory.com/entry/android-studio-download-install-easy)
   - 설치 가이드에 있는 ADB 설치까지 따라하기

---

## 🐳 Docker 개발 환경

### 첫 실행 (한 번만)
```bash
# 프로젝트 루트에서
cd docker
docker-compose up
```

실행되는 서비스:
- **installer**: 의존성 자동 설치 (완료 후 종료)
- **metro**: React Native Metro 번들러 자동 시작

### 이후 사용법
1. **Docker Desktop** 실행
2. **Containers** 탭에서 `docker` 프로젝트 찾기
3. **Start** 버튼 클릭 ▶️

### Docker Desktop에서 개별 서비스 제어
- **metro**: 항상 실행 상태 유지 (자동 재시작)
- **android**: 개발용 앱 빌드/실행 (Start 버튼으로 수동 실행)
- **android-release**: 릴리즈 버전 빌드 (배포용, Start 버튼으로 수동 실행)

---

## 🚀 프로젝트 실행

### 1. Metro 번들러 실행 확인
```bash
# 브라우저에서 확인
http://localhost:8082
```

### 2. Android 앱 실행
#### 사전 준비사항
- Metro 번들러 실행 확인
- 안드로이드 에뮬레이터 또는 실제 디바이스 연결 확인: `adb devices`

#### 실행 방법
```bash
# Docker를 통한 실행
Docker Desktop에서 android 서비스 Start 버튼 클릭

# 또는 터미널에서
docker-compose up android

# 로컬에서 직접 실행
npm run android
```

### 3. 릴리즈 버전 빌드
```bash
# Docker를 통한 실행
Docker Desktop에서 android-release 서비스 Start 버튼 클릭

# 또는 터미널에서
docker-compose up android-release
```

---

## 🔧 문제 해결

### 주요 문제들

#### Metro 포트 충돌 (8082)
```bash
# Windows
netstat -ano | findstr :8082
taskkill /PID [PID번호] /F
```

#### 의존성/빌드 문제
```bash
cd docker
docker-compose down -v
docker-compose up
```

#### ADB 인식 안됨
```bash
adb kill-server
adb start-server
adb devices
```