# livecity  
Interactive system for monitoring city traffic  
Current stable version: ```0.3```;  
Current beta version: ```0.3.0```;  
Next beta version: ```0.3.1``` (will be released on or before April, 20).

## Features
### Current features list:
1. Displaying routes, points, transports;
2. Displaying transport arrival data;
3. Point editor (full functionality), route editor (create only), basic guide editor;
4. Basic authorization.

### Will be implemented:
1. Full guide functionality ```0.3.1```
2. User roles ```0.4.0```
3. Saving, sharing guides ```0.4.0```
4. Transport info ```1.0.0```
5. Locales ```1.0.0```
6. Basic socket.io implementation ```1.0.0```
8. API documentation ```1.0.0```
9. Registration ```1.0.0```
10. Route editor (full functionality) ```1.1.0```

## Quick guide
### Installing livecity (Linux users)

1. Download source, and go to the source folder:  
```cd livecity```
2. Install required software (```mongoDB```, ```nodejs```, ```npm```):  
```sudo apt-get install mongodb nodejs npm```
3. Install dependencies:  
```npm install```
4. Configure application  
``` nano config.json```

### Installing livecity (Windows users)

Currently manual for installing livecity on Windows is not ready  
In future releases installing scripts will be added

### Running

To run livecity, just fire in terminal:
```npm start```

## Routes

```/data/[points, routes, nodes, transports]``` - Data CRUD
* GET - get all items
* POST - create item
* PUT ```/data/[type]/id``` - update item by ```id```
* GET ```/data/[type]/id``` - get item by ```id```
* DELETE ```/data/[type]/id``` - delete item by ```id```


```/service/[type]``` - Services
[TBA]



## Wiki

Github [wiki] (https://github.com/invercity/livecity/wiki) pages





