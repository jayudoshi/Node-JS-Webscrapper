const puppeteer = require('puppeteer');
const stringSimilarity = require('string-similarity')
const readXlsxFile = require('read-excel-file/node')
var fs = require('fs');

const createCsvWriter = require('csv-writer').createObjectCsvWriter;

function manipulateData(productDetails,TITLE){
    let products = productDetails.filter(product => {
        let title = product.title.replace(/[-:(].+/g, "").trim().toLowerCase();
        TITLE = TITLE.trim().toLowerCase()
        var similarity = stringSimilarity.compareTwoStrings(title,TITLE);
        return similarity > 0.9
    })
    
    products.sort((a,b) => {
        if ( a.rs < b.rs ){
            return -1;
        }
        if ( a.rs > b.rs ){
            return 1;
        }
        return 0;
    })
    return products[0]
}

const run = async (ISBN,TITLE) => {
    
    const browser = await puppeteer.launch({headless:false})
    const page = await browser.newPage()
    
    await page.setRequestInterception(true);
    page.on('request', request => {
    if (request.resourceType() === 'image')
        request.abort();
    else
        request.continue();
    });
    
    await page.goto('https://www.snapdeal.com/',{ waitUntil: 'load', timeout: 0 })
    await page.waitForSelector('div.topBar.top-bar-homepage.top-freeze-reference-point')
    
    await (await page.$('input.searchformInput.keyword')).type(ISBN + '')
    const searchButton = await page.$('button.searchformButton.rippleGrey')
    await searchButton.click()
    await page.waitForSelector('div.product-row.js-product-list')

    const products = await page.$$('div.favDp.product-tuple-listing.js-tuple')
    
    let scrapData = {
        found: '',
        isbn: ISBN,
        title: TITLE,
        data: ''
    }

    if(products.length < 1){
        scrapData.found = 'NO'
    }else{
        scrapData.found = 'YES'
    }

    let productDetails = []
    for ( let i = 0 ; i < products.length ; i++){
        let link = await products[i].$eval('div.product-tuple-description div.product-desc-rating a', a => a.getAttribute('href'))
        let title = await products[i].$eval('div.product-tuple-description p.product-title', a => a.innerHTML)
        let rs = await products[i].$eval('div.product-price-row span.product-price', a => a.innerHTML.split(' ')[2])
        let index = i
        rs = Number(rs) ? Number(rs) : 0
        productDetails.push({link,title,rs,index})
    }

    let product = manipulateData(productDetails,TITLE)

    const scrape = async (product) => {
        
        const data = {}
        
        const page1 = await browser.newPage()
        await page1.goto(product.link,{ waitUntil: 'load', timeout: 0 })
        await page1.setRequestInterception(true)
        page1.on('request', request => {
            if (request.resourceType() === 'image')
                request.abort();
            else
                request.continue();
            });
        await page1.waitForSelector('div.pdp-elec-topcenter-inner')
    

        const info = await page1.$$('div.p-keyfeatures.kf-below-name ul.clearfix li')
        for (const i of info){
            
            var INFO = await i.$eval('span.h-content' , li => li.innerHTML)

            if(INFO){
                var pattern = new RegExp('^[a-z][a-z]+');
                var information = null
                INFO = INFO.trim()
                INFO = INFO.toLowerCase()

                let content = INFO.split(':')
                content.map(con => {
                    if(pattern.test(con)){
                        information = con
                    }
                })

                if(information){
                    if(INFO.includes('publisher')){
                        data.publisher = information
                    }else if(INFO.includes('language')){
                        data.language = information
                    }else if(INFO.includes('author')){
                        data.author = information
                    }
                }
                
            }
        }
    
        
        data.rs = product.rs
        data.title = product.title

        try{
            const err = await page1.$eval('div.pdp-elec-topcenter-inner div.sold-out-err' , div => div.innerHTML)
            data.stock = 'NA'
        }catch(e){
            data.stock = 'Available'
        }

        if(!data.author){
            data.author = 'NA'
        }
        if(!data.publisher){
            data.publisher = 'NA'
        }
        if(!data.language){
            data.language = 'NA'
        }
        data.url = product.link

        
        await page1.close()
        return data
    }

    scrapData.data = await scrape(product)

    await browser.close()
    console.log(scrapData)
    return scrapData
}

function capatalize(STRING){
    let arr = STRING.split(' ')
    let str = ''
    arr.map(word => {
        word = word[0].toUpperCase() + word.substring(1)
        str = str + word + ' '
    })
    str = str.trim()
    return str
}

const funCall = async (input) => {
    let promises = []
    input.map(ip => {
        promises.push(run(ip.isbn,ip.title))
    })
    Promise.all(promises)
    .then(results => {
        console.log(results)
        const csvWriter = createCsvWriter({
        path: 'Output1.csv',
        header: [
            {id: 'isbn' , title: 'ISBN'},
            {id: 'title' , title: 'Book Title'},
            {id: 'found' , title: 'Found'},
            {id: 'author' , title: 'Author'},
            {id: 'publisher' , title: 'Publisher'},
            {id: 'language' , title: 'Language'},
            {id: 'stock' , title: 'Stock'},
            {id: 'rs' , title: 'Price'},
            {id: 'url' , title: 'Url'},
        ]
    });
    
    let records = []
    results.map(result => {
        let obj = {
            isbn:result.isbn,
            title: capatalize(result.title),
            found: capatalize(result.found),
            author: capatalize(result.data.author),
            publisher: capatalize(result.data.publisher),
            language: capatalize(result.data.language),
            stock: capatalize(result.data.stock),
            rs:result.data.rs,
            url:result.data.url,
        }
        records.push(obj)
    })

    csvWriter
    .writeRecords(records)
    .then(()=> console.log('Output CSV file created successfully' ));
    })
}

const initialize = async () => {
    let input = []
    await  readXlsxFile('./Input.xlsx').then((rows) => {
        rows.map( (row,i) => {
            if(i == 0){
                return
            }
            input.push({
                title:row[1],
                isbn:row[2],
            })
        })
    })
    funCall(input)

}
initialize()