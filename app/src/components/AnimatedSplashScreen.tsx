/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withDelay,
} from 'react-native-reanimated';
import Svg, { Polygon, G } from 'react-native-svg';

import { Asset } from 'expo-asset';
import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioPlayer,
} from 'expo-audio';

import { APP_COLORS } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';

const SPIN_SOUND = require('../../assets/sounds/spin.mp3');

const waitForPlayerReady = async (
  player: AudioPlayer,
  isCancelled: () => boolean,
  timeoutMs = 4000
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isCancelled()) return false;
    if (player.isLoaded) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return player.isLoaded;
};

const releasePlayer = (player: AudioPlayer | null) => {
  if (!player) return;
  try { player.pause(); } catch { }
  try { player.release(); } catch { }
};

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

const SPLASH_DURATION_MS = 4200;

export default function AnimatedSplashScreen({ onAnimationFinish }: { onAnimationFinish: () => void }) {
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;

  const rotation = useSharedValue(720);
  const textProgress = useSharedValue(0);

  // Keep a stable ref to onAnimationFinish so we never need it in the effect deps
  const onFinishRef = useRef(onAnimationFinish);
  useEffect(() => {
    onFinishRef.current = onAnimationFinish;
  }, [onAnimationFinish]);

  const audioStopped = useRef(false);
  const hasFinishedRef = useRef(false);
  const spinPlayerRef = useRef<AudioPlayer | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopSplashAudio = () => {
    if (audioStopped.current) return;
    audioStopped.current = true;

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    releasePlayer(spinPlayerRef.current);
    spinPlayerRef.current = null;
  };

  const safeFinish = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    stopSplashAudio();
    onFinishRef.current();
  };

  useEffect(() => {
    let cancelled = false;
    // Reset on every mount so a re-mount (e.g. hot reload) works correctly
    audioStopped.current = false;
    hasFinishedRef.current = false;

    const isCancelledOrStopped = () => cancelled || audioStopped.current;

    const startSplashAudio = async () => {
      try {
        await setIsAudioActiveAsync(true);
        await setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'mixWithOthers',
          shouldPlayInBackground: false,
        });

        const spinAsset = await Asset.fromModule(SPIN_SOUND).downloadAsync();

        if (isCancelledOrStopped()) return;

        const spinPlayer = createAudioPlayer({ uri: spinAsset.localUri ?? spinAsset.uri });

        spinPlayerRef.current = spinPlayer;
        spinPlayer.volume = 1;

        const ready = await waitForPlayerReady(spinPlayer, isCancelledOrStopped);

        if (!ready || isCancelledOrStopped()) return;

        await spinPlayer.seekTo(0);
        spinPlayer.play();

        const spinStopTimer = setTimeout(() => {
          if (isCancelledOrStopped()) return;
          try { spinPlayer.pause(); } catch { }
        }, 1000);
        timersRef.current.push(spinStopTimer);

        // ---- Start Visuals In Sync With Audio ----
        rotation.value = withTiming(0, {
          duration: 1000,
          easing: Easing.bezier(0.1, 1, 0.2, 1),
        });

        textProgress.value = withDelay(1000, withTiming(8, { duration: 1500, easing: Easing.linear }));

        const finishTimer = setTimeout(() => {
          if (cancelled) return;
          safeFinish();
        }, SPLASH_DURATION_MS);
        timersRef.current.push(finishTimer);

      } catch (error) {
        console.warn('[splash] audio setup failed', error);
        if (!cancelled) safeFinish();
      }
    };

    startSplashAudio();

    return () => {
      cancelled = true;
      stopSplashAudio();
    };
  }, []);

  const logoAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  return (
    <View style={[styles.container, { backgroundColor: COLORS.bg }]}>
      <View style={styles.content}>
        <AnimatedSvg
          width="80"
          height="80"
          viewBox="-50 -50 100 100"
          style={[logoAnimatedStyle, { marginBottom: 32 }]}
        >
          <G fill={COLORS.charcoal}>
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <Polygon
                key={angle}
                points="0,0 16,-45 -16,-45"
                transform={`rotate(${angle})`}
              />
            ))}
          </G>
        </AnimatedSvg>

        <View style={styles.textContainer}>
          {'wordRoot'.split('').map((char, index) => (
            <AnimatedLetter
              key={index}
              char={char}
              index={index}
              textProgress={textProgress}
              color={COLORS.charcoal}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function AnimatedLetter({ char, index, textProgress, color }: { char: string, index: number, textProgress: any, color: string }) {
  const charStyle = useAnimatedStyle(() => {
    const opacity = Math.max(0, Math.min(1, textProgress.value - index));
    const translateY = 15 * (1 - opacity);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  return (
    <Animated.Text style={[styles.brandText, { color }, charStyle]}>
      {char}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    fontFamily: 'Geist_700Bold',
    fontSize: 56,
    letterSpacing: -4,
  },
});
