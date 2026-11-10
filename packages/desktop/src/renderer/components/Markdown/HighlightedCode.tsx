import React from 'react';
import SyntaxHighlighter, { type SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';

type Props = SyntaxHighlighterProps & { dark: boolean };

export default function HighlightedCode({ dark, ...props }: Props) {
  return <SyntaxHighlighter {...props} style={dark ? vs2015 : vs} />;
}
