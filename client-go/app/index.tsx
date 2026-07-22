import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_USER_ID } from '@/constants/config';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_USER_ID).then((userId) => {
      if (userId) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/onboarding/autoimmune-status');
      }
    });
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFA' }}>
      <ActivityIndicator size="large" color="#E55A4E" />
    </View>
  );
}
