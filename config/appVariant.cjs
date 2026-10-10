/** @param {Readonly<Record<string, string | undefined>>} env */
function appVariant(env) {
  if (!env.EXPO_PUBLIC_VIMA_VARIANT && (env.NODE_ENV === 'production' || env.EAS_BUILD_PROFILE)) throw new Error('explicit_release_variant_required');
  const variant = env.EXPO_PUBLIC_VIMA_VARIANT ?? (env.NODE_ENV === 'production' || env.EAS_BUILD_PROFILE ? 'production' : 'development');
  if (!['development', 'qa', 'production'].includes(variant)) throw new Error('invalid_app_variant');
  const profile = env.EAS_BUILD_PROFILE?.replace('-simulator', '');
  if (profile && profile !== variant) throw new Error('inconsistent_build_variant');
  if (variant === 'qa') {
    if (env.EXPO_PUBLIC_VIMA_FIXTURES === '1') throw new Error('qa_fixtures_forbidden');
    for (const name of ['EXPO_PUBLIC_VIMA_API_BASE_URL', 'EXPO_PUBLIC_MAP_STYLE_URL']) {
      const url = new URL(env[name] ?? '');
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('qa_requires_public_https_config');
    }
  }
  return { variant, suffix: variant === 'production' ? '' : variant === 'qa' ? '.qa' : '.dev' };
}

exports.appVariant = appVariant;
