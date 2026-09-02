import React, { forwardRef } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation
} from 'react-native-reanimated';

const AnimatedComponent = Animated.createAnimatedComponent(Pressable);

export interface AnimatedPressableProps extends PressableProps {
  style?: StyleProp<ViewStyle> | any;
  activeOpacity?: number;
}

const AnimatedPressable = forwardRef<any, AnimatedPressableProps>(
  ({ children, style, onPressIn, onPressOut, activeOpacity = 0.8, ...rest }, ref) => {
    const scaleX = useSharedValue(1);
    const scaleY = useSharedValue(1);
    const opacity = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => {
      return {
        transform: [{ scaleX: scaleX.value }, { scaleY: scaleY.value }],
        opacity: opacity.value,
      };
    });

    const handlePressIn = (e: any) => {
      cancelAnimation(scaleX);
      cancelAnimation(scaleY);
      
      const pressInEasing = Easing.bezier(0.4, 0, 0.2, 1);
      
      scaleX.value = withTiming(0.82, { duration: 180, easing: pressInEasing });
      scaleY.value = withTiming(0.7, { duration: 180, easing: pressInEasing });
      opacity.value = withTiming(activeOpacity, { duration: 100 });
      
      if (onPressIn) {
        onPressIn(e);
      }
    };

    const handlePressOut = (e: any) => {
      cancelAnimation(scaleX);
      cancelAnimation(scaleY);
      
      const pressOutEasing = Easing.bezier(0.34, 1.56, 0.64, 1);
      const totalDuration = 350;
      
      scaleX.value = withSequence(
        withTiming(1.05, { duration: totalDuration * 0.55, easing: pressOutEasing }),
        withTiming(1, { duration: totalDuration * 0.45, easing: pressOutEasing })
      );
      
      scaleY.value = withSequence(
        withTiming(1.08, { duration: totalDuration * 0.55, easing: pressOutEasing }),
        withTiming(1, { duration: totalDuration * 0.45, easing: pressOutEasing })
      );
      
      opacity.value = withTiming(1, { duration: 150 });
      
      if (onPressOut) {
        onPressOut(e);
      }
    };

    return (
      <AnimatedComponent
        ref={ref}
        style={[style, animatedStyle]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...rest}
      >
        {children}
      </AnimatedComponent>
    );
  }
);

AnimatedPressable.displayName = 'AnimatedPressable';

export default AnimatedPressable;
