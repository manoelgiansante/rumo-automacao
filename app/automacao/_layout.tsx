import React from 'react';
import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function AutomacaoLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'ios_from_right',
        animationDuration: 300,
      }}
    >
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="fabricacao" />
      <Stack.Screen name="fornecimento-automatico" />
      <Stack.Screen name="fornecimento-manual" />
      <Stack.Screen name="carregamento" />
      <Stack.Screen name="configuracoes" />
      <Stack.Screen name="dispositivos" />
      <Stack.Screen name="relatorios" />
      <Stack.Screen name="receitas" />
      <Stack.Screen name="ingredientes" />
      <Stack.Screen name="currais-rfid" />
      <Stack.Screen name="safe-points" />
      <Stack.Screen name="login-operador" />
      <Stack.Screen name="ordem-producao" />
      <Stack.Screen name="sobra" />
      <Stack.Screen name="ocorrencia-parada" />
      <Stack.Screen name="descarte" />
      <Stack.Screen name="sincronismo" />
    </Stack>
  );
}
