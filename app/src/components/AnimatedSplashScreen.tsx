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

import {
  useAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  preload,
  type AudioPlayer,
} from 'expo-audio';

import { APP_COLORS } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';

const SPIN_SOUND = require('../../assets/sounds/spin.mp3');

// Preload audio at module level for instant playback
try {
  preload(SPIN_SOUND);
} catch {}

const waitForPlayerReady = async (player: AudioPlayer, timeoutMs = 4000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (player.isLoaded) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  try {
    return player.isLoaded;
  } catch {
    return false;
  }
};

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

const SPLASH_DURATION_MS = 4200;

export default function AnimatedSplashScreen({ onAnimationFinish }: { onAnimationFinish: () => void }) {
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;

  const rotation = useSharedValue(720);
  const textProgress = useSharedValue(0);

  const spinPlayer = useAudioPlayer(SPIN_SOUND);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let cancelled = false;

    // Start Visual Animations IMMEDIATELY so splash isn't delayed
    rotation.value = withTiming(0, {
      duration: 1000,
      easing: Easing.bezier(0.1, 1, 0.2, 1),
    });

    textProgress.value = withDelay(1000, withTiming(8, { duration: 1500, easing: Easing.linear }));

    const finishTimer = setTimeout(() => {
      if (cancelled) return;
      onAnimationFinish();
    }, SPLASH_DURATION_MS);
    timersRef.current.push(finishTimer);

    // Prepare and Play Audio Asynchronously
    const startAudio = async () => {
      try {
        await setIsAudioActiveAsync(true);
        await setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'mixWithOthers',
          shouldPlayInBackground: false,
        });

        if (cancelled) return;

        const isReady = spinPlayer.isLoaded || (await waitForPlayerReady(spinPlayer));
        if (!isReady || cancelled) return;

        spinPlayer.volume = 1;
        try { await spinPlayer.seekTo(0); } catch {}
        try { spinPlayer.play(); } catch {}

        const spinStopTimer = setTimeout(() => {
          if (cancelled) return;
          try {
            if (spinPlayer.isLoaded) {
              spinPlayer.pause();
            }
          } catch {}
        }, 1000);
        timersRef.current.push(spinStopTimer);
      } catch (err) {
        // Non-fatal audio setup warning
      }
    };

    startAudio();

    return () => {
      cancelled = true;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onAnimationFinish]);

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
