import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => {
      const isAuthenticated = false;

      if (!isAuthenticated) {
        router.replace("/forms");
      } else {
        router.replace("/login");
      }
    }, 100); // 100ms delay is usually safe

    return () => clearTimeout(timeout);
  }, [router]);

  return null;
}