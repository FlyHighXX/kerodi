import { type ReactNode } from 'react';
import { type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { ExternalLink } from '@/components/external-link';

type Props = {
  url: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Web cannot use a native WebView, so fall back to the deep link in a tab. */
export function FreeriderRouteLink({ url, children, style }: Props) {
  return (
    <ExternalLink href={url} style={style as StyleProp<TextStyle>}>
      {children}
    </ExternalLink>
  );
}
