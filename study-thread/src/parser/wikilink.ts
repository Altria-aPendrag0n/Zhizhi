import { fileExists } from '../utils/vault-fs'

export interface WikiLink {
  raw: string
  target: string
  alias: string | null
  start: number
  end: number
}

export interface WikiLinkTarget {
  path: string
  title: string
}

function normalizeTarget(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\.md$/i, '').toLocaleLowerCase()
}

function getPathCandidates(path: string): string[] {
  const normalized = normalizeTarget(path)
  const noteRelativePath = normalized.includes('/notes/') ? normalized.split('/notes/')[1] : normalized.replace(/^notes\//, '')
  return [normalized, noteRelativePath, noteRelativePath.split('/').pop() || '']
}

export function parseWikiLinks(text: string): WikiLink[] {
  const links: WikiLink[] = []
  const regex = /\[\[([^\]|#]+)(?:[|#]([^\]]+))?\]\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const target = match[1].trim()
    if (!target) continue
    links.push({
      raw: match[0],
      target,
      alias: match[2] ? match[2].trim() : null,
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  return links
}

export function resolveWikiLinkTarget(link: Pick<WikiLink, 'target'> | string, notes: WikiLinkTarget[]): WikiLinkTarget | null {
  const target = normalizeTarget(typeof link === 'string' ? link : link.target)
  const directMatch = notes.find((note) => getPathCandidates(note.path).includes(target))
  if (directMatch) return directMatch

  return notes.find((note) => normalizeTarget(note.title) === target) || null
}

export async function resolveWikiLink(link: WikiLink, vaultPath: string): Promise<string | null> {
  const candidates = [
    `${vaultPath}/notes/${link.target}.md`,
    `${vaultPath}/notes/${link.target}`,
    `${vaultPath}/${link.target}.md`,
    `${vaultPath}/${link.target}`,
  ]

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate
  }

  return null
}

export function extractAllLinks(text: string): string[] {
  return [...new Set(parseWikiLinks(text).map((link) => link.target))]
}

export function renderWikiLink(wikiLink: WikiLink, resolved: boolean, path?: string): string {
  const display = wikiLink.alias || wikiLink.target
  const classNames = resolved ? 'wikilink wikilink--resolved' : 'wikilink wikilink--unresolved'
  const href = resolved ? `#/notes/${encodeURIComponent(path || wikiLink.target)}` : '#'
  const target = resolved && path ? ` data-note-path="${encodeURIComponent(path)}"` : ''
  return `<a class="${classNames}" href="${href}"${target}>${display}</a>`
}
