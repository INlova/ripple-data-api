var winston = require('winston'),
  moment    = require('moment'),
  ripple    = require('ripple-lib'),
  async     = require('async');

/**
 *  totalValueSent: 
 * 
 *  total of amounts sent or exchanged from any wallet, either through a payment 
 *  or an "offerCreate" that exercises another offer, for a curated list of 
 *  currency/issuers and XRP, normalized to a specified currency
 *
 *  request : 
 *
 * {
 *    startTime : (any momentjs-readable date), // optional, defaults to 1 day before end time
 *    endTime   : (any momentjs-readable date), // optional, defaults to now
 *    exchange  : {                             // optional, defaults to XRP
 *      currency  : (XRP, USD, BTC, etc.),         
 *      issuer    : "rAusZ...."                 // optional, required if currency != XRP
 *    }
 * }
 *
 * response : 
 *
 * {
 *    startTime    : "2014-03-13T20:39:26+00:00",       //period start
 *    endTime      : "2014-03-14T20:39:26+00:00",       //period end
 *    exchange     : {
 *      currency : "USD",                               //exchange currency
 *      issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"  //exchange issuer
 *    },
 *    exchangeRate : 0.014301217579817786,              //exchange rate
 *    total        : 726824.6504823748,                 //total value sent
 *    count        : 6040,                              //number of transactions
 *    components   : [                                  //list of component currencies
 *      {
 *        currency        : "USD",
 *        issuer          : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
 *        amount          : 27606.296227064257,
 *        count           : 51,
 *        rate            : 1,
 *        convertedAmount : 27606.296227064257
 *      },
 *      .
 *      .
 *      .
 *      .
 *    ]
 * }
 * 
 *
    curl -H "Content-Type: application/json" -X POST -d '{
    "exchange"  : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}
  
    }' http://localhost:5993/api/total_value_sent 
    
 
 */

function totalValueSent(params, callback) {

  var cachKey, live, viewOpts = {};
  var ex = params.exchange || {currency:"XRP"};
  
  if (typeof ex != 'object')               return callback('invalid exchange currency');
  else if (!ex.currency)                   return callback('exchange currency is required');
  else if (typeof ex.currency != 'string') return callback('invalid exchange currency');
  else if (ex.currency.toUpperCase() != "XRP" && !ex.issuer)
    return callback('exchange issuer is required');
  else if (ex.currency == "XRP" && ex.issuer)
    return callback('XRP cannot have an issuer');
 
 
  //all currencies we are going to check    
  var currencies = [ 
    {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},  //Bitstamp USD
    {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},  //Bitstamp BTC
    {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap USD
    {currency: 'BTC', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap BTC
    {currency: 'EUR', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap EUR
    {currency: 'BTC', issuer: 'rJHygWcTLVpSXkowott6kzgZU6viQSVYM1'}, //Snapswap USD
    {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'}, //RippleCN CNY
    {currency: 'CNY', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'}, //RippleChina CNY
    {currency: 'JPY', issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'}, //RippleTradeJapan JPY
    {currency: 'XRP'}
  ];
 
  
  //XRP conversion rates for each of the currencies - these must be in the same order as above  
  var conversionPairs = [
    {
      //XRP value of Bitstamp USD
      base    : {currency: 'XRP'},
      counter : {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'}
    },
    {
      //XRP value of Bitstamp BTC
      base    : {currency: 'XRP'},
      counter : {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'}
    },
    {
      //XRP value of Snapswap USD
      base    : {currency: 'XRP'},
      counter : {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}
    },
    {
      //XRP value of Snapswap BTC
      base    : {currency: 'XRP'},
      counter : {currency: 'BTC', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}
    },
    {
      //XRP value of Snapswap BTC
      base    : {currency: 'XRP'},
      counter : {currency: 'EUR', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}
    },    
    {
      // Justcoin BTC market
      base: {currency:'XRP'},
      counter: {currency:'BTC', issuer: 'rJHygWcTLVpSXkowott6kzgZU6viQSVYM1'}
    },
    {
      //XRP value of RippleCN CNY
      base    : {currency: 'XRP'},
      counter : {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'}
    },
    {
      //XRP value of RippleChina CNY
      base    : {currency: 'XRP'},
      counter : {currency: 'CNY', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'}
    },
    {
      //XRP value of RippleTradeJapan JPY
      base    : {currency: 'XRP'},
      counter : {currency: 'JPY', issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'}
    }
  ];
  
  
  //parse startTime and endTime
  var startTime, endTime;

  if (!params.startTime && !params.endTime) {

    startTime = moment.utc().subtract('hours', 24);
    endTime   = moment.utc();

  } else if (params.startTime && params.endTime && moment(params.startTime).isValid() && moment(params.endTime).isValid()) {

    if (moment(params.startTime).isBefore(moment(params.endTime))) {
      startTime = moment.utc(params.startTime);
      endTime   = moment.utc(params.endTime);
    } else {
      endTime   = moment.utc(params.startTime);
      startTime = moment.utc(params.endTime);
    }

  } else if (params.endTime && moment(params.endTime).isValid()) {
    
    endTime   = moment.utc(params.endTime);
    startTime = moment.utc(params.endTime).subtract('hours', 24);
    
  } else {

    if (!moment(params.startTime).isValid()) {
      return callback('invalid startTime: ' + params.startTime + ' is invalid at: ' + moment(params.startTime).invalidAt());
    }

    if (!moment(params.endTime).isValid()) {
      return callback('invalid endTime: ' + params.endTime + ' is invalid at: ' + moment(params.endTime).invalidAt());
    }

    return;
  }  
   
  if (endTime.isBefore(startTime)) { //swap times
    tempTime  = startTime;
    startTime = endTime;
    endTime   = tempTime;
  } else if (endTime.isSame(startTime)) {
    return callback('please provide 2 distinct times');
  }
    
  if (CACHE) {
    cacheKey = "TVS:" + ex.currency;
    if (ex.issuer) cacheKey += "."+ex.issuer;
    if (endTime.unix()==moment.utc().unix()) { //live update request
      cacheKey += ":live:"+endTime.diff(startTime, "seconds");
      live = true;
    } else {
      cacheKey += ":hist:"+startTime.unix()+":"+endTime.unix();
      live = false;
    }
 
    redis.get(cacheKey, function(error, response){
      if (error)                      return callback("Redis - " + error);
      if (response && params.history) return callback(null, true);
      else if (response)              return callback(null, JSON.parse(response));  
      else fromCouch();
    });
    
  } else fromCouch();
  
  function fromCouch() {  
    //prepare results to send back
    var response = {
      startTime : startTime.format(),
      endTime   : endTime.format(),
      exchange  : ex,  
    };
        
    // Mimic calling valueSent for each asset pair
    async.map(currencies, function(assetPair, asyncCallbackPair){
  
      require("./valueSent")({
        currency  : assetPair.currency,
        issuer    : assetPair.issuer,
        startTime : startTime,
        endTime   : endTime
        
      }, function(error, data) {

        if (error) return asyncCallbackPair(error);

        if (data && data.length > 1) {
          assetPair.amount = data[1][1]; 
          assetPair.count  = data[1][2];
        } else {
          assetPair.amount = 0;
          assetPair.count  = 0;
        }
        
        asyncCallbackPair(null, assetPair);
      
      });
  
    }, function(error, currencies) {

      if (error) return callback(error);
  
      getExchangeRates(startTime, endTime, conversionPairs, function(error, rates){
        if (error) return callback(error);
        
        var finalRate = ex.currency == "XRP" ? 1 : null;
        
        rates.forEach(function(pair, index){
          currencies[index].rate            = pair.rate || 0; 
          currencies[index].convertedAmount = pair.rate ? currencies[index].amount / pair.rate : 0;
        
          //check to see if the pair happens to be the
          //final conversion currency we are looking for
          if (pair.counter.currency == ex.currency &&
              pair.counter.issuer   == ex.issuer) finalRate = pair.rate;
        });
        
        
        if (finalRate) finalize();
        else {
          getConversion({
            startTime : startTime,
            endTime   : endTime,
            currency  : ex.currency,
            issuer    : ex.issuer
            
          }, function(error, rate) {
            if (error) return callback (error);
            finalRate = rate;
            finalize(); 
          });
        }
             
        function finalize () {
          var total = 0, count = 0;
          currencies.forEach(function(currency, index) {
  
            if (currency.currency == "XRP") {
              currency.rate            = 1; //for XRP
              currency.convertedAmount = currency.amount;
            }
            
            currency.convertedAmount *= finalRate;
            currency.rate = currency.rate ? finalRate / currency.rate : 0;
            total += currency.convertedAmount;
            count += currency.count;
          });
        
          response.exchangeRate = finalRate;
          response.total        = total;
          response.count        = count;
          response.components   = currencies;
          
          if (CACHE) {
            cacheResponse (cacheKey, response);
          }
          
          if (params.history) callback(null, false);
          else callback(null, response);          
        }  
      });
    });
  }   



  /*
   * get exchange rates for the listed currencies
   * 
   */
  function getExchangeRates (startTime, endTime, pairs, callback) {
    
    // Mimic calling offersExercised for each asset pair
    async.mapLimit(pairs, 10, function(assetPair, asyncCallbackPair){
  
      require("./offersExercised")({
        base      : assetPair.base,
        counter   : assetPair.counter,
        startTime : startTime,
        endTime   : endTime,
        timeIncrement: 'all'
       
      }, function(error, data) {
  
        if (error) return asyncCallbackPair(error);
        if (data && data.length > 1) 
              assetPair.rate = data[1][8]; // vwavPrice
        else  assetPair.rate = 0;
        
        asyncCallbackPair(null, assetPair);
        
      });
  
    }, function(error, results){
      if (error) return callback(error);
      return callback(null, results);
    });  
  }
  
  
  
  /*
   * get XRP to specified currency conversion
   * 
   */
  function getConversion (params, callback) {
    
    // Mimic calling offersExercised 
    require("./offersExercised")({
      base      : {currency:"XRP"},
      counter   : {currency:params.currency,issuer:params.issuer},
      startTime : params.startTime,
      endTime   : params.endTime,
      timeIncrement : 'all'
      
    }, function(error, data) {
  
      if (error) return callback(error);
      if (data && data.length > 1) 
           callback(null,data[1][8]); // vwavPrice
      else callback("cannot determine exchange rate");
      
    });    
  }
  
  function cacheResponse (cacheKey, response) {
    redis.set(cacheKey, JSON.stringify(response), function(error, res){
      if (error) return callback("Redis - "+ error);
      if (live)  redis.expire(cacheKey, 240); //expire in 4 minutes  
      if (DEBUG) winston.info(cacheKey + " cached");
    });
  }
}

module.exports = totalValueSent;
