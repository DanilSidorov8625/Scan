import { Stack } from 'expo-router';

export default function FormsLayout() {
    return (
        <Stack>
            <Stack.Screen
                name="index"
                options={{
                    headerShown: false
                }}
            />
            <Stack.Screen
                name="dynamic"
                options={{
                    headerShown: false
                }}
            />
        </Stack>
    );
}