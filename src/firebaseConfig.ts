type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

const REQUIRED_ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID"
] as const;

export function getFirebaseWebConfig(): FirebaseWebConfig {
  const values = Object.fromEntries(REQUIRED_ENV_KEYS.map((key) => [key, envValue(key)]));
  const missing = REQUIRED_ENV_KEYS.filter((key) => !isConfigured(values[key]));

  if (missing.length > 0) {
    throw new Error(`Firebase Web 配置缺失：${missing.join(", ")}。请复制 .env.example 到 .env.local 并填写 Firebase Web app config。`);
  }

  const measurementId = envValue("VITE_FIREBASE_MEASUREMENT_ID");
  const config: FirebaseWebConfig = {
    apiKey: values.VITE_FIREBASE_API_KEY,
    authDomain: values.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: values.VITE_FIREBASE_PROJECT_ID,
    storageBucket: values.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: values.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: values.VITE_FIREBASE_APP_ID
  };

  return isConfigured(measurementId) ? { ...config, measurementId } : config;
}

function envValue(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key];
  return typeof value === "string" ? value.trim() : "";
}

function isConfigured(value: string | undefined): value is string {
  return Boolean(value && value !== "replace-me");
}
