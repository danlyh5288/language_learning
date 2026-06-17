globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("expo-audio", () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true }))
  },
  RecordingPresets: {
    HIGH_QUALITY: {
      extension: ".m4a"
    }
  },
  createAudioPlayer: jest.fn(() => ({
    pause: jest.fn(),
    play: jest.fn(),
    release: jest.fn(),
    seekTo: jest.fn()
  })),
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    uri: "file://pending-recording.m4a"
  })),
  useAudioRecorderState: jest.fn(() => ({
    isRecording: false
  }))
}));
