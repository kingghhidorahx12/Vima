import { VimaSurface, VimaText } from '../src/design/primitives';

const approvedText = ['h1', 'h2', 'h3', 'bodyRegular', 'bodyMedium', 'bodySmall', 'caption'] as const;
const approved = approvedText.map(variant => <VimaText key={variant} variant={variant}>Texto</VimaText>);

// @ts-expect-error `body` belongs to textStyle's internal API, not VimaText.
const rejectedText = <VimaText variant="body">Texto inválido</VimaText>;

const approvedSurface = <VimaSurface variant="screen" />;
// @ts-expect-error Public surfaces are restricted to approved theme keys.
const rejectedSurface = <VimaSurface variant="unknown" />;

void [approved, rejectedText, approvedSurface, rejectedSurface];
