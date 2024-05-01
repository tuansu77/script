/*
更新时间：2024.04.11 10:40
更新内容：新增按通知类别保留或延迟消失,模块关闭提示音(SurgeTF参数)

Surge配置
https://raw.githubusercontent.com/githubdulong/Script/master/Surge/AUTOTF.sgmodule
Boxjs订阅
https://raw.githubusercontent.com/githubdulong/Script/master/boxjs.json
*/

if (typeof $request !== 'undefined' && $request) {
    let url = $request.url

    let keyPattern = /^https:\/\/testflight\.apple\.com\/v3\/accounts\/(.*?)\/apps/
    let key = url.match(keyPattern) ? url.match(keyPattern)[1] : null
    const handler = (appIdMatch) => {
        if (appIdMatch && appIdMatch[1]) {
            let appId = appIdMatch[1]
            let existingAppIds = $persistentStore.read('APP_ID')
            let appIdSet = new Set(existingAppIds ? existingAppIds.split(',') : [])
            if (!appIdSet.has(appId)) {
                appIdSet.add(appId)
                $persistentStore.write(Array.from(appIdSet).join(','), 'APP_ID')
                $notification.post('APP_ID đã được chụp', '', `APP_ID đã được chụp và lưu trữ: ${appId}`, {"auto-dismiss": 2})
                console.log(`Store APP_ID đã được chụp và lưu trữ : ${appId}`)
            } else {
                $notification.post('APP_ID trùng lặp', '', `APP_ID: ${appId} đã tồn tại, không cần thêm lại。` , {"auto-dismiss": 2})
                console.log(`APP_ID: ${appId} đã tồn tại, không cần thêm lại。`)
            }
        } else {
            console.log('Không có TestFlight APP_ID hợp lệ được chụp')
        }
    }
    if (/^https:\/\/testflight\.apple\.com\/v3\/accounts\/.*\/apps$/.test(url) && key) {
        let headers = Object.fromEntries(Object.entries($request.headers).map(([key, value]) => [key.toLowerCase(), value]))
        let session_id = headers['x-session-id']
        let session_digest = headers['x-session-digest']
        let request_id = headers['x-request-id']

        $persistentStore.write(session_id, 'session_id')
        $persistentStore.write(session_digest, 'session_digest')
        $persistentStore.write(request_id, 'request_id')
        $persistentStore.write(key, 'key')

        let existingAppIds = $persistentStore.read('APP_ID')
        if (!existingAppIds) {
            $notification.post('Thông tin được lấy thành công🎉', '', 'Vui lòng lấy APP_ID và chỉnh sửa các tham số mô-đun để tắt tập lệnh' , {"auto-dismiss": 10})
        }
        console.log(`信息获取成功: session_id=${session_id}, session_digest=${session_digest}, request_id=${request_id}, key=${key}`)
    } else if (/^https:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)$/.test(url)) {
        const appIdMatch = url.match(/^https:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)$/)
        handler(appIdMatch)
    } else if (/v3\/accounts\/.*\/ru/.test(url)) {
        const appIdMatch = url.match(/v3\/accounts\/.*\/ru\/(.*)/)
        handler(appIdMatch)
    }

    $done({})
} else {
    !(async () => {
        let ids = $persistentStore.read('APP_ID')
        if (!ids) {
            console.log('APP_ID không được phát hiện')
            $done()
        } else {
            ids = ids.split(',')
            for await (const ID of ids) {
                await autoPost(ID, ids)
            }
            if (ids.length === 0) {
                $notification.post('tất cả TestFlight đã được thêm vào🎉', '', 'Mô-đun đã tự động đóng và ngừng chạy', {"sound": true});
                $done($httpAPI('POST', '/v1/modules', {'Public beta giám sát': false}));
            } else {
                $done()
            }
        }
    })()
}

async function autoPost(ID, ids) {
    let Key = $persistentStore.read('key')
    let testurl = `https://testflight.apple.com/v3/accounts/${Key}/ru/`
    let header = {
        'X-Session-Id': $persistentStore.read('session_id'),
        'X-Session-Digest': $persistentStore.read('session_digest'),
        'X-Request-Id': $persistentStore.read('request_id')
    }

    return new Promise((resolve) => {
        $httpClient.get({ url: testurl + ID, headers: header }, (error, response, data) => {
            if (error) {
                console.log(`${ID} yêu cầu mạng không thành công: ${error}, giữ lại APP_ID`);
                resolve();
                return;
            }

            if (response.status === 500) {
                console.log(`${ID} lỗi 
            máy 
                chủ, mã trạng thái 500, giữ lại APP_ID`);
                resolve();
                return
            }

            if (response.status !== 200) {
                console.log(`${ID} không phải là một liên kết hợp lệ: mã trạng thái ${response.status}, xóa APP_ID`)
                ids.splice(ids.indexOf(ID), 1)
                $persistentStore.write(ids.join(','), 'APP_ID')
                $notification.post('Không phải là liên kết TestFlight hợp lệ', '', `${ID} đã bị xóa` , {"auto-dismiss": 2})
                resolve()
                return
            }

            let jsonData
            try {
                jsonData = JSON.parse(data)
            } catch (parseError) {
                console.log(`${ID} phân tích cú pháp phản hồi không thành công: ${parseError}, giữ lại APP_ID`)
                resolve()
                return
            }

            if (!jsonData || !jsonData.data) {
                console.log(`${ID} Lời mời không được chấp nhận , giữ APP_ID`)
                resolve()
                return
            }

            if (jsonData.data.status === 'FULL') {
                console.log(`${ID} test đã đầy, giữ APP_ID`)
                resolve()
                return
            }

            $httpClient.post({ url: testurl + ID + '/accept', headers: header }, (error, response, body) => {
                if (!error && response.status === 200) {
                    let jsonBody
                    try {
                        jsonBody = JSON.parse(body)
                    } catch (parseError) {
                        console.log(`${ID} Phân tích cú pháp phản hồi yêu cầu tham gia không thành công: ${parseError}, giữ lại APP_ID`)
                        resolve()
                        return
                    }

                    console.log(`${jsonBody.data.name} TestFlight đã tham gia thành công``)
                    ids.splice(ids.indexOf(ID), 1)
                    $persistentStore.write(ids.join(','), 'APP_ID')
                    if (ids.length > 0) {
                        $notification.post(jsonBody.data.name + ' TestFlight đã tham gia thành công', '', `Tiếp tục thực thi ID APP：${ids.join(',')}`, {"sound": true})
                    } else {
                        $notification.post(jsonBody.data.name + ' TestFlight đã tham gia thành công', '', 'Tất cả ID ứng dụng đã được xử lý', {"sound": true})
                    }
                } else {
                    console.log(`${ID} không thành công tham gia: ${error || `Mã trạng thái ${response.status}`}，giữ lại APP_ID`)
                }
                resolve()
            })
        })
    })
}
