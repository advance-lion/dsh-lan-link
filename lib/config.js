import z from '@deepseek-ai/schemastery'

export const name = 'lan-link-config'
export const inject = ['settings']
export const LAN_LINK_NAMESPACE = 'lan-link'

export const Config = z.object({
  enabled: z.boolean().default(false),
  port: z.natural().min(1).max(65535).default(3080),
  cookieMaxAgeDays: z.natural().min(1).max(3650).default(30),
})

export function resolveStartupConfig(value) {
  return Object.freeze({
    enabled: value.enabled,
    host: value.enabled ? '0.0.0.0' : '127.0.0.1',
    port: value.port,
    cookieMaxAgeDays: value.cookieMaxAgeDays,
  })
}

export function apply(ctx) {
  const scope = ctx.settings.register(LAN_LINK_NAMESPACE, Config, { applies: 'restart' })
  const startup = resolveStartupConfig(scope.get())
  ctx.provide('lanLinkConfig', Object.freeze({
    ...startup,
    get: () => scope.get(),
    update: patch => scope.update(patch),
  }))
}
