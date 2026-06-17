import {
  AudioModule,
  createAudioPlayer,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState
} from "expo-audio";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AlertCircle, Mic, Play, RotateCcw, Square } from "../components/icons";
import { errorMessage, formatDuration } from "../format";
import { colors, styles } from "../theme";
import type { MobileWordRecord, PendingRecording } from "../data/types";

type AudioRecorderPanelProps = {
  word: MobileWordRecord | null;
  pendingRecording: PendingRecording | null;
  onPreview: (recording: PendingRecording) => void;
  onDiscard: () => void;
};

export function AudioRecorderPanel({ word, pendingRecording, onPreview, onDiscard }: AudioRecorderPanelProps) {
  const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: "document" });
  const recorderState = useAudioRecorderState(audioRecorder);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [status, setStatus] = useState<"idle" | "recording" | "processing">("idle");
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const startedAtRef = useRef(0);

  const playbackUri = pendingRecording?.uri ?? word?.recordingUri ?? null;
  const hasRecording = Boolean(pendingRecording || word?.hasRecording);
  const displayDuration = pendingRecording?.durationMs ?? word?.audioDurationMs ?? 0;
  const activeBars = useMemo(() => {
    if (status !== "recording") {
      return 0;
    }
    return 8 + Math.round(((elapsedMs / 160) % 1) * 12);
  }, [elapsedMs, status]);

  useEffect(() => {
    if (status !== "recording") {
      return undefined;
    }

    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 160);

    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    return () => {
      playerRef.current?.release();
    };
  }, []);

  async function playRecording() {
    if (!playbackUri) {
      return;
    }

    try {
      playerRef.current?.pause();
      playerRef.current?.release();
      const player = createAudioPlayer(playbackUri);
      playerRef.current = player;
      player.seekTo(0);
      player.play();
    } catch (caught) {
      setRecordingError(errorMessage(caught));
    }
  }

  async function startRecording() {
    setRecordingError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setRecordingError("麦克风权限被拒绝");
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true
      });
      await audioRecorder.prepareToRecordAsync();
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setStatus("recording");
      await audioRecorder.record();
    } catch (caught) {
      setStatus("idle");
      setRecordingError(errorMessage(caught));
    }
  }

  async function stopRecording() {
    if (!recorderState.isRecording && status !== "recording") {
      return;
    }

    try {
      setStatus("processing");
      await audioRecorder.stop();
      const durationMs = Math.max(0, Date.now() - startedAtRef.current);
      const uri = audioRecorder.uri;
      if (!uri) {
        setRecordingError("录音为空，请重试");
        setStatus("idle");
        return;
      }

      onPreview({
        uri,
        durationMs,
        mimeType: "audio/m4a"
      });
      setElapsedMs(durationMs);
    } catch (caught) {
      setRecordingError(errorMessage(caught));
    } finally {
      setStatus("idle");
    }
  }

  return (
    <View style={styles.audioSurface}>
      <View style={styles.audioHeader}>
        <View>
          <Text style={styles.audioLabel}>发音录音</Text>
          <Text style={styles.audioValue}>
            {pendingRecording
              ? `新录音 ${formatDuration(pendingRecording.durationMs)}`
              : word?.hasRecording
                ? `当前录音 ${formatDuration(word.audioDurationMs)}`
                : "尚未录音"}
          </Text>
        </View>
        {pendingRecording ? <Text style={styles.pendingPill}>待保存</Text> : null}
      </View>

      {playbackUri ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="试听录音"
          style={styles.secondaryButton}
          onPress={() => void playRecording()}
        >
          <Play size={17} color={colors.primaryStrong} fill={colors.primaryStrong} />
          <Text style={styles.secondaryButtonText}>试听 {formatDuration(displayDuration)}</Text>
        </Pressable>
      ) : (
        <View style={styles.audioPlaceholder}>
          <Text style={styles.mutedText}>保存一段录音后可在这里试听</Text>
        </View>
      )}

      <View style={styles.recorderControls}>
        {status === "recording" || status === "processing" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={status === "processing" ? "录音处理中" : "停止录音"}
            disabled={status === "processing"}
            style={[styles.secondaryButton, { backgroundColor: colors.danger }]}
            onPress={() => void stopRecording()}
          >
            <Square size={16} color="#ffffff" fill="#ffffff" />
            <Text style={[styles.primaryButtonText, { fontSize: 14 }]}>{status === "processing" ? "处理中" : "停止"}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => void startRecording()}>
            <Mic size={17} color={colors.primaryStrong} />
            <Text style={styles.secondaryButtonText}>{hasRecording ? "重新录音" : "录音"}</Text>
          </Pressable>
        )}

        {pendingRecording && status !== "recording" ? (
          <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={onDiscard}>
            <RotateCcw size={16} color={colors.primaryStrong} />
            <Text style={styles.secondaryButtonText}>丢弃</Text>
          </Pressable>
        ) : null}

        <Text style={styles.timer}>{formatDuration(status === "recording" ? elapsedMs : displayDuration)}</Text>
      </View>

      <View accessibilityLabel="输入音量" style={styles.meter}>
        {Array.from({ length: 22 }, (_, index) => (
          <View
            key={index}
            style={[
              styles.meterBar,
              { height: 8 + ((index % 4) * 4) },
              status === "recording" && index < activeBars ? styles.meterBarActive : null
            ]}
          />
        ))}
      </View>

      {recordingError ? (
        <View style={styles.inlineWarning}>
          <AlertCircle size={16} color={colors.warning} />
          <Text style={styles.inlineWarningText}>{recordingError}</Text>
        </View>
      ) : null}
    </View>
  );
}
