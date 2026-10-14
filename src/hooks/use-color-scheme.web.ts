import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

// There is no external store to subscribe to here: we only need to know whether
// we are rendering on the client (after hydration) or during static rendering.
const subscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 *
 * `useSyncExternalStore` returns the server snapshot (`false`) while hydrating and the
 * client snapshot (`true`) afterwards, so the HTML stays deterministic without a
 * setState-in-effect cascade.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
