/* eslint-disable react-hooks/immutability */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
} from 'react-native-reanimated';
import { APP_COLORS } from '../constants/theme';

interface AnalogClockPickerProps {
  initialTime?: string; // Format: "HH:mm" (24-hour)
  onTimeChange: (time: string) => void;
  isDarkMode: boolean;
}

const CLOCK_SIZE = Dimensions.get('window').width * 0.7;
const CENTER = CLOCK_SIZE / 2;
const RADIUS = CLOCK_SIZE / 2 - 20;
const HOUR_RADIUS = RADIUS * 0.6;
const MINUTE_RADIUS = RADIUS * 0.9;

export default function AnalogClockPicker({
  initialTime = "09:00",
  onTimeChange,
  isDarkMode,
}: AnalogClockPickerProps) {
  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;

  // Parse initial time
  const [initHourStr, initMinStr] = initialTime.split(':');
  let initHour = parseInt(initHourStr, 10);
  const initMin = parseInt(initMinStr, 10);
  
  const initialIsPM = initHour >= 12;
  const initial12Hour = initHour % 12;
  
  const [isPM, setIsPM] = useState(initialIsPM);
  const [displayHour, setDisplayHour] = useState(initial12Hour === 0 ? 12 : initial12Hour);
  const [displayMinute, setDisplayMinute] = useState(initMin);

  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const activeMode = useSharedValue<'hour' | 'minute'>('hour');

  const hourAngle = useSharedValue((initial12Hour % 12) * 30);
  const minuteAngle = useSharedValue(initMin * 6);

  // Sync state & angles if initialTime prop changes
  useEffect(() => {
    const [hStr, mStr] = (initialTime || "09:00").split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return;

    const pm = h >= 12;
    const h12 = h % 12;
    const resolvedH12 = h12 === 0 ? 12 : h12;

    setIsPM(pm);
    setDisplayHour(resolvedH12);
    setDisplayMinute(m);
    hourAngle.value = (h12 % 12) * 30;
    minuteAngle.value = m * 6;
  }, [initialTime]);

  const handleSetMode = (m: 'hour' | 'minute') => {
    setMode(m);
    activeMode.value = m;
  };

  const syncTime = (h12: number, m: number, pm: boolean) => {
    let h24 = h12;
    if (pm && h12 !== 12) h24 += 12;
    if (!pm && h12 === 12) h24 = 0;
    
    const formatted = `${h24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    onTimeChange(formatted);
  };

  const updateHour = (h: number) => {
    setDisplayHour(h);
    syncTime(h, displayMinute, isPM);
  };

  const updateMinute = (m: number) => {
    setDisplayMinute(m);
    syncTime(displayHour, m, isPM);
  };

  const handleToggleAMPM = (newIsPM: boolean) => {
    setIsPM(newIsPM);
    syncTime(displayHour, displayMinute, newIsPM);
  };

  const panGesture = Gesture.Pan()
    .minDistance(0)
    .onUpdate((e) => {
      const dx = e.x - CENTER;
      const dy = e.y - CENTER;
      
      let theta = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (theta < 0) theta += 360;
      
      if (activeMode.value === 'hour') {
        let h = Math.round(theta / 30);
        if (h === 0 || h === 12) h = 12;
        hourAngle.value = (h % 12) * 30;
        runOnJS(updateHour)(h);
      } else {
        let m = Math.round(theta / 6);
        if (m >= 60) m = 0;
        minuteAngle.value = m * 6;
        runOnJS(updateMinute)(m);
      }
    })
    .onEnd(() => {
      if (activeMode.value === 'hour') {
        runOnJS(handleSetMode)('minute');
      }
    });

  const hourHandStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: HOUR_RADIUS / 2 },
        { rotate: `${hourAngle.value}deg` },
        { translateY: -HOUR_RADIUS / 2 },
      ],
      opacity: withSpring(activeMode.value === 'hour' ? 1 : 0.4),
    };
  });

  const minuteHandStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: MINUTE_RADIUS / 2 },
        { rotate: `${minuteAngle.value}deg` },
        { translateY: -MINUTE_RADIUS / 2 },
      ],
      opacity: withSpring(activeMode.value === 'minute' ? 1 : 0.4),
    };
  });

  const generateTicks = () => {
    const ticks = [];
    // Ticks
    for (let i = 0; i < 12; i++) {
      const isMajor = i % 3 === 0;
      const tickAngle = i * 30;
      ticks.push(
        <View
          key={`tick-${i}`}
          style={[
            styles.tick,
            { backgroundColor: COLORS.warmgray },
            isMajor ? styles.tickMajor : styles.tickMinor,
            {
              transform: [
                { rotate: `${tickAngle}deg` },
                { translateY: -(CLOCK_SIZE / 2 - 12) },
              ],
            },
          ]}
        />
      );
    }
    // Numbers
    const numberPositions = [
      { num: 12, angle: 0 },
      { num: 3, angle: 90 },
      { num: 6, angle: 180 },
      { num: 9, angle: 270 },
    ];
    
    numberPositions.forEach((pos) => {
      const angleRad = (pos.angle - 90) * (Math.PI / 180);
      const textRadius = RADIUS - 20;
      const x = CENTER + textRadius * Math.cos(angleRad);
      const y = CENTER + textRadius * Math.sin(angleRad);

      ticks.push(
        <View
          key={`num-${pos.num}`}
          style={{
            position: 'absolute',
            left: x - 15,
            top: y - 15,
            width: 30,
            height: 30,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{
            fontFamily: 'Outfit_700Bold',
            fontSize: 16,
            color: COLORS.charcoal,
          }}>
            {mode === 'hour' ? pos.num : (pos.num === 12 ? '00' : pos.num * 5)}
          </Text>
        </View>
      );
    });

    return ticks;
  };

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <View style={[styles.clockContainer, { backgroundColor: isDarkMode ? '#242426' : '#F2F2F7' }]}>
          <View style={styles.clockCenter}>
            {generateTicks()}
            
            {/* Hour Hand */}
            <Animated.View style={[styles.hourHandWrapper, hourHandStyle]}>
              <View style={[styles.hourHandLine, { backgroundColor: COLORS.charcoal }]} />
            </Animated.View>

            {/* Minute Hand */}
            <Animated.View style={[styles.minuteHandWrapper, minuteHandStyle]}>
              <View style={[styles.minuteHandLine, { backgroundColor: COLORS.charcoal }]} />
            </Animated.View>
            
            {/* Center Dot */}
            <View style={[styles.centerDot, { backgroundColor: COLORS.charcoal }]} />
          </View>
        </View>
      </GestureDetector>

      <View style={styles.timeDisplayContainer}>
        <AnimatedPressable onPress={() => handleSetMode('hour')} style={[styles.timeSegment, mode === 'hour' && { backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8 }]}>
          <Text style={[styles.timeText, { color: mode === 'hour' ? COLORS.charcoal : COLORS.warmgray }]}>
            {displayHour.toString().padStart(2, '0')}
          </Text>
        </AnimatedPressable>
        <Text style={[styles.timeText, { color: COLORS.charcoal, marginHorizontal: 4 }]}>:</Text>
        <AnimatedPressable onPress={() => handleSetMode('minute')} style={[styles.timeSegment, mode === 'minute' && { backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8 }]}>
          <Text style={[styles.timeText, { color: mode === 'minute' ? COLORS.charcoal : COLORS.warmgray }]}>
            {displayMinute.toString().padStart(2, '0')}
          </Text>
        </AnimatedPressable>
      </View>

      <View style={styles.ampmContainer}>
        <AnimatedPressable
          style={[styles.toggleBtn, !isPM ? [styles.toggleActive, { backgroundColor: COLORS.charcoal }] : { backgroundColor: COLORS.card }]}
          onPress={() => handleToggleAMPM(false)}
        >
          <Text style={[styles.toggleText, !isPM ? [styles.toggleTextActive, { color: COLORS.bg }] : { color: COLORS.warmgray }]}>AM</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.toggleBtn, isPM ? [styles.toggleActive, { backgroundColor: COLORS.charcoal }] : { backgroundColor: COLORS.card }]}
          onPress={() => handleToggleAMPM(true)}
        >
          <Text style={[styles.toggleText, isPM ? [styles.toggleTextActive, { color: COLORS.bg }] : { color: COLORS.warmgray }]}>PM</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  clockContainer: {
    width: CLOCK_SIZE,
    height: CLOCK_SIZE,
    borderRadius: CLOCK_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clockCenter: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: CLOCK_SIZE,
    height: CLOCK_SIZE,
  },
  tick: {
    position: 'absolute',
    left: CENTER - 1.5,
    top: CENTER - 6,
    width: 3,
    borderRadius: 1.5,
  },
  tickMajor: {
    height: 12,
  },
  tickMinor: {
    height: 6,
    opacity: 0.5,
  },
  centerDot: {
    position: 'absolute',
    left: CENTER - 6,
    top: CENTER - 6,
    width: 12,
    height: 12,
    borderRadius: 6,
    zIndex: 20,
  },
  hourHandWrapper: {
    position: 'absolute',
    left: CENTER - 4,
    top: CENTER - HOUR_RADIUS,
    height: HOUR_RADIUS,
    width: 8,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 10,
  },
  hourHandLine: {
    width: 4,
    height: HOUR_RADIUS,
    borderRadius: 2,
  },
  minuteHandWrapper: {
    position: 'absolute',
    left: CENTER - 3,
    top: CENTER - MINUTE_RADIUS,
    height: MINUTE_RADIUS,
    width: 6,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 5,
  },
  minuteHandLine: {
    width: 3,
    height: MINUTE_RADIUS,
    borderRadius: 1.5,
  },
  timeDisplayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 16,
  },
  timeSegment: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  timeText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 32,
    letterSpacing: 2,
  },
  ampmContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  toggleBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  toggleActive: {
  },
  toggleText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  toggleTextActive: {
  },
});
