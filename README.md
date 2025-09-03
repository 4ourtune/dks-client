# Digital Key System (DKS) Client

React Native 기반의 디지털 키 관리 및 차량 제어 애플리케이션

## 프로젝트 개요

TC375 마이크로컨트롤러와 BLE 통신을 통해 차량을 제어하는 디지털 키 시스템입니다.

### 주요 기능
- 디지털 키 관리 (등록, 수정, 삭제)
- 차량 제어 (잠금/해제, 시동, 트렁크)
- BLE를 통한 실시간 차량 상태 모니터링
- JWT 기반 사용자 인증
- 오프라인 모드 지원 (Mock 데이터)

## 필수 소프트웨어 설치

### 1. Node.js 18.x 이상
- [Node.js 공식 웹사이트](https://nodejs.org/)에서 LTS 버전 다운로드 및 설치
- 설치 확인: `node --version`

### 2. Android Studio 및 ADB
- [Android Studio 설치 가이드](https://joo-selfdev.tistory.com/entry/android-studio-download-install-easy) 참고
- 가이드에 설명된 대로 ADB 설치까지 완료
- 환경 변수 설정:
  ```bash
  # Windows - 시스템 환경 변수에 추가
  ANDROID_HOME=C:\Users\[username]\AppData\Local\Android\Sdk
  Path에 %ANDROID_HOME%\platform-tools 추가
  ```
- 설치 확인: `adb devices`

## 프로젝트 설정 및 실행

### 의존성 설치
```bash
npm install
```

### Android Debug Keystore 설정

처음 프로젝트를 클론한 경우, Android 빌드를 위한 debug keystore가 필요합니다:

```bash
# Android 디렉토리로 이동
cd android/app

# Debug keystore 생성 (이미 존재하면 건너뛰기)
keytool -genkey -v -keystore debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"

# 프로젝트 루트로 돌아가기
cd ../..
```

**또는** 기존 debug.keystore가 git에 포함되어 있다면 별도 설정 불필요합니다.

### 1. 로컬 개발 환경

#### 개발 서버 실행
```bash
# Metro 번들러 시작
npm start

# Android 앱 실행 (별도 터미널)
npm run android
```

#### 릴리즈 버전 빌드
```bash
npm run release-android
```

#### 코드 품질 검사
```bash
npm run lint  # ESLint 실행
npm test      # Jest 테스트 실행
```

## 프로젝트 구조

```
src/
├── components/       # 재사용 가능한 UI 컴포넌트
├── navigation/       # 네비게이션 설정
├── screens/          # 화면 컴포넌트
├── services/         # 외부 서비스 연동
│   ├── api/         # REST API 통신
│   ├── ble/         # BLE 통신 (TC375)
│   └── storage/     # 로컬 저장소
├── stores/          # Zustand 상태 관리
├── styles/          # 스타일 정의
├── types/           # TypeScript 타입 정의
└── utils/           # 유틸리티 함수
```

## 기술 스택

- **React Native 0.75.4**: 크로스 플랫폼 모바일 개발
- **TypeScript**: 정적 타입 검사
- **Zustand**: 상태 관리
- **React Navigation**: 내비게이션
- **react-native-ble-plx**: BLE 통신
- **Axios**: HTTP 클라이언트
- **react-native-keychain**: 보안 토큰 저장
- **crypto-js**: 암호화 작업

## API 및 BLE 설정

### 환경별 API 서버 설정

앱은 `src/config/environment.ts`에서 환경별로 다른 API URL을 사용합니다.

#### 환경 전환 방법
```typescript
// src/config/environment.ts
const CURRENT_ENV: Environment = 'development'; // 여기서 환경 변경
```

#### 환경별 API URL 구성
```typescript
const configs = {
  development: {
    API_BASE_URL: 'http://10.0.2.2:3000/api',      // Android 에뮬레이터용
    ENVIRONMENT: 'development',
  },
  production: {
    API_BASE_URL: 'http://34.46.208.174:3000/api',  // 클라우드 서버
    ENVIRONMENT: 'production',
  },
};
```

#### 디바이스별 연결 방법

| 디바이스 타입 | API URL | 비고 |
|---------------|---------|------|
| **Android 에뮬레이터** | `http://10.0.2.2:3000/api` | 에뮬레이터에서 호스트 컴퓨터 접근 |
| **실제 Android 폰** | `http://[컴퓨터IP]:3000/api` | 같은 WiFi 네트워크 필요 |
| **iOS 시뮬레이터** | `http://localhost:3000/api` | macOS에서만 사용 가능 |
| **클라우드 서버** | `http://34.46.208.174:3000/api` | 프로덕션 환경 |

#### 컴퓨터 IP 주소 찾기
```bash
# Windows
ipconfig | findstr "IPv4"

# macOS/Linux  
ifconfig | grep "inet "
```

**주의**: 실제 디바이스 테스트 시 컴퓨터와 폰이 같은 WiFi 네트워크에 연결되어 있어야 합니다.

### BLE 설정 (TC375 마이크로컨트롤러)
```typescript
export const BLE_CONFIG = {
  SERVICE_UUID: '12345678-1234-1234-1234-123456789abc',
  CHAR_UUID: '87654321-4321-4321-4321-cba987654321',
  DEVICE_NAME_PREFIX: 'TC375',
};
```

### 지원하는 차량 명령어
- **UNLOCK/LOCK**: 도어 제어
- **START/STOP**: 엔진 제어
- **TRUNK**: 트렁크 제어
- **STATUS**: 차량 상태 조회

## 문제 해결

### Metro 포트 충돌 (8082)
```bash
# Windows
netstat -ano | findstr :8082
taskkill /PID [PID번호] /F
```

### ADB 인식 안됨
```bash
adb kill-server
adb start-server
adb devices
```

### Gradle 문제 (Android)
```bash
cd android
./gradlew clean
cd ..
```