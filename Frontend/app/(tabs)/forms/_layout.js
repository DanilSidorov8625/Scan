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
                name="[formId]"
                options={{
                    headerShown: false
                }}
            />
        </Stack>
    );
}