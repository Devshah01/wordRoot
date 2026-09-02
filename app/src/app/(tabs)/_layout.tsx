import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import AnimatedPressable from '../../components/AnimatedPressable';
import { Home, Calendar, BookOpen, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/useAppStore';
import { APP_COLORS } from '../../constants/theme';

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const isTabBarHidden = useAppStore(store => store.isTabBarHidden);
  const isDarkMode = useAppStore(store => store.isDarkMode);

  const COLORS = isDarkMode ? APP_COLORS.dark : APP_COLORS.light;
  const styles = React.useMemo(() => getStyles(COLORS), [COLORS]);

  if (isTabBarHidden) return null;

  return (
    <View style={[styles.tabBarContainer, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
      <View style={styles.tabBar}>
        {state.routes.map((route: any, index: number) => {
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          let IconComponent;
          if (route.name === 'dashboard') IconComponent = Home;
          else if (route.name === 'calendar') IconComponent = Calendar;
          else if (route.name === 'review') IconComponent = BookOpen;
          else if (route.name === 'profile') IconComponent = User;
          else return null;

          return (
            <View key={route.key}>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={onPress}
                style={styles.tabItem}
                activeOpacity={0.7}
              >
                <IconComponent 
                  size={20} 
                  color={isFocused ? COLORS.charcoal : COLORS.warmgray} 
                  strokeWidth={isFocused ? 2.5 : 2}
                />
              </AnimatedPressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="review" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 30,
    height: 52,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: COLORS.bone,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItem: {
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  }
});
