import { FriendHelpBook, Book, FriendHelp } from '../models'
import { checkAdminToken, checkUserToken } from '../utils'

export default function(router) {
  router.post('/api/friend_help_book', async (ctx, next) => {
    // 要求后端管理员权限
    if (!(await checkAdminToken(ctx, next, 'friend_help_book_add'))) {
      return false
    }
    let { bookid, need_num, limit_time } = ctx.request.body
    need_num = parseInt(need_num)
    if (limit_time) {
      limit_time = parseInt(limit_time)
    } else {
      limit_time = -1
    }
    // 检查bookid是否存在
    if (!bookid || !need_num) {
      ctx.body = { ok: false, msg: '参数错误' }
      return false
    }
    // 检查bookid是否正确
    let book = await Book.findById(bookid, 'id')
    if (!book) {
      ctx.body = { ok: false, msg: '书籍不存在' }
      return false
    }
    // 判断当前书籍是否已经创建了助力信息
    let friendHelpBook = await FriendHelpBook.findOne({ bookid }, 'id')
    if (friendHelpBook) {
      ctx.body = { ok: false, msg: '当前书籍已经是好友助力书籍' }
      return false
    }
    let count = await FriendHelpBook.count()
    // 创建助力信息
    friendHelpBook = await FriendHelpBook.create({
      bookid: await FriendHelpBook.transId(bookid),
      need_num: need_num,
      limit_time: limit_time,
      index: count + 1,
      create_time: new Date()
    })
    ctx.body = { ok: true, msg: '创建助力书籍成功', data: friendHelpBook }
  })

  router.get('/api/friend_help_book', async (ctx, next) => {
    // 要求后端管理员权限
    if (!(await checkAdminToken(ctx, next, 'friend_help_book_list'))) {
      return false
    }
    let { page, limit } = ctx.request.query
    if (page) {
      page = parseInt(page)
      if (page < 1) {
        page = 1
      }
    } else {
      page = 1
    }
    if (limit) {
      limit = parseInt(limit)
      if (limit < 1) {
        limit = 10
      }
    } else {
      limit = 10
    }
    let allFriendHelpBookNum = await FriendHelpBook.count()
    let friendHelpBooks = await FriendHelpBook.find()
      .populate({
        path: 'bookid',
        select: '_id name img_url author'
      })
      .sort({ index: 1, create_time: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
    ctx.body = { ok: true, msg: '获取好友助力书籍成功', total: allFriendHelpBookNum, list: friendHelpBooks }
  })

  router.put('/api/friend_help_book/:id', async (ctx, next) => {
    // 要求后端管理员权限
    if (!(await checkAdminToken(ctx, next, 'friend_help_book_update'))) {
      return false
    }
    let { need_num, limit_time } = ctx.request.body
    let friendHelpBookid = ctx.params.id
    // 检查friendHelpBookid是否存在
    if (!friendHelpBookid) {
      ctx.body = { ok: false, msg: '参数错误' }
      return false
    }
    // 检查friendHelpBookid是否正确
    let friendHelpBook = await FriendHelpBook.findById(friendHelpBookid, 'id')
    if (!friendHelpBook) {
      ctx.body = { ok: false, msg: '好友助力书籍不存在' }
      return false
    }
    // 整理更新参数
    let params = {}
    if (typeof limit_time !== 'undefined') {
      params.limit_time = parseInt(limit_time)
    }
    if (typeof need_num !== 'undefined') {
      params.need_num = parseInt(need_num)
    }
    if (JSON.stringify(params) === '{}') {
      ctx.body = { ok: false, msg: '参数不能为空' }
      return false
    }
    // 更新书籍
    let updateResult = await FriendHelpBook.update({ _id: friendHelpBookid }, { $set: params })
    if (updateResult.ok === 1) {
      ctx.body = { ok: true, msg: '更新好友助力书籍成功', data: await FriendHelpBook.findById(friendHelpBookid) }
    } else {
      ctx.body = { ok: false, msg: '更新好友助力书籍失败', data: updateResult }
    }
  })

  router.delete('/api/friend_help_book/:id', async (ctx, next) => {
    // 要求后端管理员权限
    if (!(await checkAdminToken(ctx, next, 'friend_help_book_delete'))) {
      return false
    }
    let friendHelpBookid = ctx.params.id
    // 检查friendHelpBookid是否存在
    if (!friendHelpBookid) {
      ctx.body = { ok: false, msg: '参数错误' }
      return false
    }
    // 检查friendHelpBookid是否正确
    let friendHelpBook = await FriendHelpBook.findById(friendHelpBookid, 'id index')
    if (!friendHelpBook) {
      ctx.body = { ok: false, msg: '好友助力书籍不存在' }
      return false
    }
    // 删除好友助力书籍
    let deleTeResult = await FriendHelpBook.remove({ _id: friendHelpBookid })
    if (deleTeResult.result.ok === 1) {
      // 更新数据库中的index
      let needUpdateArr = await FriendHelpBook.find({ index: { $gt: friendHelpBook.index } }, '_id')
      let updateArr = []
      for (let i = 0; i < needUpdateArr.length; i++) {
        updateArr.push(
          new Promise((resolve, reject) => {
            FriendHelpBook.update({ _id: needUpdateArr[i].id }, { $set: { index: friendHelpBook.index + i } }, (err, res) => {
              if (err) {
                reject(err)
                return false
              } else {
                resolve(true)
              }
            })
          })
        )
      }
      return new Promise((resolve, reject) => {
        Promise.all(updateArr)
          .then(res => {
            // 更新完成
            ctx.body = { ok: true, msg: '删除好友助力书籍成功' }
            resolve(true)
          })
          .catch(err => {
            ctx.body = { ok: false, msg: '更新助力书籍顺序值失败' }
            resolve(true)
          })
      })
    } else {
      ctx.body = { ok: false, msg: '删除好友助力书籍失败', data: deleTeResult.result }
    }
  })

  // 后台助力书籍置顶接口
  router.get('/api/friend_help_book/:id/top', async (ctx, next) => {
    let friendHelpBookid = ctx.params.id
    // 检查friendHelpBookid是否存在
    if (!friendHelpBookid) {
      ctx.body = { ok: false, msg: '参数错误' }
      return false
    }
    // 检查friendHelpBookid是否正确
    let friendHelpBook = await FriendHelpBook.findById(friendHelpBookid, 'id index')
    if (!friendHelpBook) {
      ctx.body = { ok: false, msg: '好友助力书籍不存在' }
      return false
    }
    // 开始更新
    let needUpdateArr = await FriendHelpBook.find({ index: { $lt: friendHelpBook.index } }, '_id index')
    let updateArr = []
    for (let i = 0; i < needUpdateArr.length; i++) {
      updateArr.push(
        new Promise((resolve, reject) => {
          FriendHelpBook.update({ _id: needUpdateArr[i].id }, { $set: { index: i + 2 } }, (err, res) => {
            if (err) {
              reject(err)
              return false
            } else {
              resolve(true)
            }
          })
        })
      )
    }
    updateArr.push(
      new Promise((resolve, reject) => {
        FriendHelpBook.update({ _id: friendHelpBookid }, { $set: { index: 1 } }, (err, res) => {
          if (err) {
            reject(err)
            return false
          } else {
            resolve(true)
          }
        })
      })
    )
    return new Promise((resolve, reject) => {
      Promise.all(updateArr)
        .then(res => {
          // 更新完成
          ctx.body = { ok: true, msg: '助力书籍置顶成功' }
          resolve(true)
        })
        .catch(err => {
          ctx.body = { ok: false, msg: '助力书籍置顶失败' }
          resolve(true)
        })
    })
  })

  // 小程序端获取好友助力书籍列表
  router.get('/api/friend_help_book/list', async (ctx, next) => {
    // 判断小程序端是否登录
    let userid = ''
    if (ctx.header.authorization && ctx.header.authorization.split(' ').length === 2) {
      userid = await checkUserToken(ctx, next)
    }
    let { page, limit } = ctx.request.query
    if (page) {
      page = parseInt(page)
      if (page < 1) {
        page = 1
      }
    } else {
      page = 1
    }
    if (limit) {
      limit = parseInt(limit)
      if (limit < 1) {
        limit = 10
      }
    } else {
      limit = 10
    }
    let allFriendHelpBookNum = await FriendHelpBook.count()
    let friendHelpBooks = await FriendHelpBook.find()
      .populate({
        path: 'bookid',
        select: '_id name img_url author'
      })
      .sort({ index: 1, create_time: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
    // 如果用户已经登录，同时要返回每本书的助力状态
    if (userid) {
      let findArr = []
      let newArray = JSON.parse(JSON.stringify(friendHelpBooks))
      for (let i = 0; i < friendHelpBooks.length; i++) {
        findArr.push(
          new Promise((resolve, reject) => {
            FriendHelp.findOne({ userid, fhbid: friendHelpBooks[i].id }, 'id success', (err, res) => {
              if (err) {
                reject(err)
                return false
              }
              if (res) {
                newArray[i].success = res.success
              }
              resolve(true)
            })
          })
        )
      }
      return new Promise((resolve, reject) => {
        Promise.all(findArr)
          .then(res => {
            ctx.body = { ok: true, msg: '获取好友助力书籍成功', total: allFriendHelpBookNum, list: newArray }
            resolve(true)
          })
          .catch(err => {
            ctx.body = { ok: true, msg: '获取好友助力书籍成功', total: allFriendHelpBookNum, list: newArray }
            resolve(true)
          })
      })
    } else {
      ctx.body = { ok: true, msg: '获取好友助力书籍成功', total: allFriendHelpBookNum, list: friendHelpBooks }
    }
  })
}
