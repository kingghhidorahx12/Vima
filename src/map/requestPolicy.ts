/** Applied only to requests for MapTiler hosts; no provider credentials live in the client. */
export const mapTilerUserAgentHeader = {
  id: 'vima-maptiler-user-agent',
  match: /^https:\/\/(?:[^/]+\.)?maptiler\.com(?:\/|$)/,
  name: 'User-Agent',
  value: 'VimaMobile/com.kingghhidorahx12.vima',
} as const;
