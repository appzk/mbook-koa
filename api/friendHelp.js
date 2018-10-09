import { FriendHelp, FriendHelpBook, User, Secret } from '../models'
import { checkUserToken, checkAdminToken } from '../utils'
import shortid from 'shortid'

export default function(router) {
  // 开始好友助力
  router.post('/api/friend_help', async (ctx, next) => {
    let userid = await checkUserToken(ctx, next)
    if (!userid) {
      return false
    }
    let { fhbid, source } = ctx.request.body
    if (!fhbid || !source) {
      ctx.body = { ok: false, msg: '参数错误' }
    }
    // 检查fhbid是否存在
    let friendHelpBook = await FriendHelpBook.findById(fhbid)
    if (!friendHelpBook) {
      ctx.body = { ok: false, msg: '找不到此好友助力书籍' }
      return false
    }
    // 检查来源的正确性
    let rightSourceArr = ['activity', 'book_detail', 'reader']
    if (rightSourceArr.indexOf(source) < 0) {
      ctx.body = { ok: false, msg: '来源错误' }
      return false
    }
    // 检测当前用户是否已经对该书籍存在分享
    let tmpFriendHelp = await FriendHelp.findOne({ userid, fhbid }, '_id fhcode')
    if (tmpFriendHelp) {
      ctx.body = { ok: true, msg: '已存在该书籍的好友助力', fhcode: tmpFriendHelp.fhcode }
    } else {
      // 创建friendHelp
      let friendHelp = await FriendHelp.create({
        fhbid: await FriendHelp.transId(fhbid),
        userid: await FriendHelp.transId(userid),
        fhcode: shortid.generate(),
        records: [],
        source,
        success: false,
        create_time: new Date()
      })
      ctx.body = { ok: true, msg: '创建好友助力成功', fhcode: friendHelp.fhcode }
    }
  })

  // 好友接受助力分享
  router.get('/api/friend_help/accept', async (ctx, next) => {
    let userid = await checkUserToken(ctx, next)
    if (!userid) {
      return false
    }
    let fhcode = ctx.request.query.fhcode
    // 校验fhcode合法性，存在并且未过期
    let friendHelp = await FriendHelp.findOne({ fhcode })
    if (!friendHelp) {
      ctx.body = { ok: false, msg: '参数错误' }
      return false
    }
    if (friendHelp.success) {
      ctx.body = { ok: false, msg: '好友助力已经完成' }
      return false
    }
    // 检验是否已经接受助力了
    let hasAccept = friendHelp.records.some(item => {
      return item.uid.toString() === userid
    })
    if (hasAccept) {
      ctx.body = { ok: false, msg: '您已经接受了该好友助力' }
      return false
    }
    // 是否超时，或者达标
    let friendHelpBook = await FriendHelpBook.findById(friendHelp.fhbid)
    let now = new Date()
    if (friendHelpBook.limit_time && now.getTime() - friendHelp.create_time.getTime() > friendHelpBook.limit_time * 24 * 60 * 60 * 1000) {
      ctx.body = { ok: false, msg: '好友助力超时' }
      return false
    }
    if (friendHelpBook.need_num && friendHelp.records.length >= friendHelpBook.need_num) {
      ctx.body = { ok: false, msg: '好友助力已完成' }
      return false
    }
    // 为好友助力添加记录
    let currentUser = await User.findById(userid)
    let data = {
      uid: currentUser.id,
      name: currentUser.username,
      avatar: currentUser.avatar,
      time: new Date()
    }
    // 判断是否已完成
    let success = false
    if (friendHelpBook.need_num && friendHelp.records.length + 1 === friendHelpBook.need_num) {
      success = true
    }
    // 开始更新
    let updateResult = await FriendHelp.update({ fhcode }, { $addToSet: { records: data }, $set: { success } })
    if (updateResult.ok == 1 && updateResult.nModified == 1) {
      if (success) {
        // 发放完成好友助力的奖励，自动为其解锁该书籍
        console.log('好友助力完成，自动为其解锁该书籍')
        await Secret.create({
          userid: await FriendHelpBook.transId(userid),
          bookid: await FriendHelpBook.transId(friendHelpBook.bookid),
          active: true,
          create_time: new Date()
        })
      }
      ctx.body = { ok: true, msg: '接受好友助力成功' }
    } else {
      ctx.body = { ok: false, msg: '接受好友助力失败' }
    }
  })
}
