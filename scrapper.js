const puppeteer = require('puppeteer');
const stringSimilarity = require('string-similarity')
var fs = require('fs');

const createCsvWriter = require('csv-writer').createObjectCsvWriter;


const run = async (ISBN,TITLE) => {
    
    const browser = await puppeteer.launch({headless:true})
    const page = await browser.newPage()
    
    await page.setRequestInterception(true);
    page.on('request', request => {
    if (request.resourceType() === 'image')
        request.abort();
    else
        request.continue();
    });
    
    await page.goto('https://www.snapdeal.com/')
    await page.waitForSelector('div.topBar.top-bar-homepage.top-freeze-reference-point')
    
    
    await (await page.$('input.searchformInput.keyword')).type(ISBN)
    const searchButton = await page.$('button.searchformButton.rippleGrey')
    await searchButton.click()
    await page.waitForSelector('div.product-row.js-product-list')

    
    const scrape = async (link) => {
        
        const data = {}
        
        const page1 = await browser.newPage()
        await page1.goto(link,{ waitUntil: 'load', timeout: 0 })
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
    
        const price = await page1.$('div.pdp-e-i-PAY-r')
        const rs = await price.$eval('span.payBlkBig' , p => p.innerHTML)
        if(Number(rs)){
            data.rs = Number(rs)
        }

        const heading = await page1.$('div.pdp-elec-topcenter-inner')
        const title = await heading.$eval('h1.pdp-e-i-head' , h => h.innerHTML)
        if(title){
            data.title = title.trim()
        }else{
            data.title = 'NA'
        }

        try{
            const err = await page1.$eval('div.pdp-elec-topcenter-inner div.sold-out-err' , div => div.innerHTML)
            data.stock = 'NA'
        }catch(e){
            data.stock = 'Available'
        }
        
        if(!data.rs){
            data.rs = 'NA'
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
        data.url = link
        data.isbn = ISBN

        
        await page1.close()
        return data
    }

    const products = await page.$$('div.favDp.product-tuple-listing.js-tuple')
    let scrapData = {
        found: '',
        isbn: ISBN,
        title: TITLE,
        data: []
    }

    if(products.length < 1){
        scrapData.found = 'NO'
    }else{
        scrapData.found = 'YES'
    }

    let count = 0
    for ( let i = 0 ; i < products.length ; i++){
        link = await products[i].$eval('div.product-tuple-description div.product-desc-rating a', a => a.getAttribute('href'))
        scrapData.data.push(await scrape(link))
        count++
        console.log('Scrapping...  ' + Math.ceil((count/products.length)*100) + '% : ' + ISBN + '(' + TITLE + ')')
    }

    await browser.close()
    return scrapData
}

function manipulateData(data,TITLE){
    data = data.filter(product => {
        let title = product.title.replace(/[-:(].+/g, "").trim().toLowerCase();
        TITLE = TITLE.trim().toLowerCase()
        var similarity = stringSimilarity.compareTwoStrings(title,TITLE);
        return similarity > 0.9
    })
    
    data.sort((a,b) => {
        if ( a.rs < b.rs ){
            return -1;
        }
        if ( a.rs > b.rs ){
            return 1;
        }
        return 0;
    })
    // console.log(data)

    return data[0]
}

async function scrape(ISBN,TITLE){
    const csvWriter = createCsvWriter({
        path:  TITLE.split(' ').join('_') + '.csv',
        header: [
            {id: 'isbn' , title: 'ISBN'},
            {id: 'title' , title: 'Book Title'},
            {id: 'found' , title: 'Found'},
            {id: 'publisher' , title: 'Publisher'},
            {id: 'author' , title: 'Author'},
            {id: 'language' , title: 'Language'},
            {id: 'stock' , title: 'Stock'},
            {id: 'rs' , title: 'Price'},
            {id: 'url' , title: 'Url'},
        ]
    });

    const obj = await run(ISBN,TITLE)

    csvWriter
    .writeRecords(obj.data)
    .then(()=> console.log(ISBN + '(' + TITLE + '): CSV created successfully' ));

    let optimalProduct = manipulateData(obj.data,TITLE)
    obj.data = optimalProduct
    return obj
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


// let results = await 
Promise.all([
    scrape('9781612680019','Rich Dad Poor Dad'),
    scrape('9780062641540','The Subtle Art of Not Giving a F'),
    scrape('9781786330895','IKIGAI'),
    scrape('9781847941831','Atomic Habits'),
    scrape('9780753555194','Zero to One'),
])
.then(results => {
    const csvWriter = createCsvWriter({
        path: 'Output.csv',
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

    console.log(results)
})