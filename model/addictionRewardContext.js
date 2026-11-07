/**
 * 沉迷结算奖励上下文。
 *
 * 结算任务用 runWithAddictionReward 包一层，期间 Add_najie_thing 发出的物品会被记进来；
 * 卖东西、管理员发奖、其它插件的调用不在上下文里，天然不会混入明细。
 * withPlayerMutationLock 用 AsyncResource 保留入队时的异步上下文，所以嵌套队列里仍读得到。
 */
import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage()

export function runWithAddictionReward(ctx, fn) {
  return storage.run(ctx, fn)
}

export function captureAddictionReward() {
  return storage.getStore() || null
}

export function recordAddictionReward(qq, name, count, thingClass) {
  const ctx = captureAddictionReward()
  if (!ctx?.rewards || !name || !(Number(count) > 0)) return
  const key = String(qq)
  let list = ctx.rewards.get(key)
  if (!list) {
    list = new Map()
    ctx.rewards.set(key, list)
  }
  const itemName = String(name)
  const prev = list.get(itemName)
  if (prev) prev.count += Number(count)
  else list.set(itemName, { name: itemName, count: Number(count), class: thingClass || '' })
}
