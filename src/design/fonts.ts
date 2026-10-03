import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { interFamilies } from './typography';
import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols/400Regular';
import { glyphFamily } from './glyphs';

// Local package assets: no runtime font request or fabricated brand asset.
export const appFonts = {
  [glyphFamily]: MaterialSymbols_400Regular,
  [interFamilies[400]]: Inter_400Regular,
  [interFamilies[500]]: Inter_500Medium,
  [interFamilies[600]]: Inter_600SemiBold,
  [interFamilies[700]]: Inter_700Bold,
};
