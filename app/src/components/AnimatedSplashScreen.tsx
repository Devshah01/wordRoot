/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withDelay,
} from 'react-native-reanimated';
import Svg, { Polygon, G } from 'react-native-svg';
import { APP_COLORS } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

export default function AnimatedSplashScreen({ onAnimationFinish }: { onAnimationFinish: () => void }) {
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;

  const rotation = useSharedValue(720); // Start at 720 degrees
  const textProgress = useSharedValue(0); // 0 to 9 for letter cascade

  useEffect(() => {
    // 1. Logo rotates fast to slow
    rotation.value = withTiming(0, {
      duration: 1800,
      easing: Easing.bezier(0.1, 1, 0.2, 1),
    });

    // 2. Letters appear sequentially
    textProgress.value = withDelay(500, withTiming(9, { duration: 900, easing: Easing.linear }));

    // 3. Finish
    const timer = setTimeout(() => {
      onAnimationFinish();
    }, 2200);

    return () => clearTimeout(timer);
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
    // opacity interpolates from 0 to 1 as textProgress passes index
    const opacity = Math.max(0, Math.min(1, textProgress.value - index));
    // slide up slightly as it fades in
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
    fontSize: 56, // Large text
    letterSpacing: -4,
  },
});
