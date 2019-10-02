/**
 * Created by Andrii Yermolenko on 1/24/14.
 */

const async = require('async');
const gm = require('googlemaps');
const config = require('config');
const utils = require('../util');


//            //
//   VALUES   //
//            //

// minute per hour (constant)
const __minutePerHour = 60;
// delta for comparing
const __deltaDistance = config.get('map.deltaDistance');
// speed - 50 km/h, will be replaced later
const __defaultSpeed = config.get('map.defaultSpeed') / __minutePerHour;
// default period for bus stop (minutes)
const __defaultStopTime = config.get('map.defaultStopTime');
// default radius for searching guide points
const __defaultSearchPointRadius = config.get('map.defaultSearchPointRadius');

/*
 * Service class
 * traffic functions
 *
 * @point - link to db.points
 * @node - link to db.nodes
 * @route - link to db.route
 * @trans - link to db.trans
 */
function Service(point, node, route, trans) {
  this.__point = point;
  this.__route = route;
  this.__node = node;
  this.__trans = trans;
}

/*
 *[P] getPointInfo - get info for selected point
 * @_id - point ID
 * @callback - callback function
 */
Service.prototype.getPointInfo = (_id, callback) => {
  const __this = this;
  // result item
  const result = {
    routes: []
  };
  // find each point
  this.__point.findById(_id, (err, currentPoint) => {
    // check error
    if ((err) || (!currentPoint)) {
      callback({
        error: 'No such point error'
      });
      // check if point find
    } else if (currentPoint) {
      // check each route of point, route is route _id
      async.each(currentPoint.routes, (routeId, eachRouteCallback) => {
        // find each route
        __this.__route.findById(routeId, (findRouteErr, route) => {
          // route not found
          if ((findRouteErr) || (!route)) {
            // return NOTFOUND result
            result.routes.push({
              route: routeId,
              status: 'NOTFOUND'
            });
            eachRouteCallback();
          } else if (route) {
            // get index of this point in route traffic
            const currentPointPosition = route.points.indexOf(_id);
            // find all trans, of this route
            __this.__trans.find({ route: routeId }, (findTransErr, allTransport) => {
              // link for nearest trans
              let nearTransport = null;
              // link to the near transport on a lap+
              let nearTransportLap = null;
              // check each trans, and find trans which is nearest to this station
              async.eachSeries(allTransport, (transport, eachTransportCallback) => {
                // find each transport index
                const transportIndex = route.points.indexOf(transport.next._id);
                // if nearTransportLap not set before, set it
                if (!nearTransportLap) nearTransportLap = transport;
                // if near not selected before, set current trans as near
                if (!nearTransport) {
                  // only if this transport BEFORE or ON current station
                  if (transportIndex <= currentPointPosition) {
                    nearTransport = transport;
                  }
                  // if nearTransport selected already, compare it with each transport
                } else {
                  // find index of currently nearest transport
                  const currentNearIndex = route.points.indexOf(nearTransport.next._id);
                  // check if currentTransport closer to currentStation
                  if ((transportIndex <= currentPointPosition) && (transportIndex > currentNearIndex)) {
                    // set each transport as nearTransport
                    nearTransport = transport;
                  }
                  // if transport AFTER the current station, and AFTER the nearTransportLap
                  if ((transportIndex > currentPointPosition) && (transportIndex < nearTransportLap)) {
                    // set transport as @nearTransportLap
                    nearTransportLap = transport;
                  }
                }
                eachTransportCallback();
              }, () => {
                // when nearest trans find
                if ((nearTransport) || (nearTransportLap)) {
                  // link to near or nearLap transport
                  const near = (nearTransport !== null) ? nearTransport : nearTransportLap;
                  /* from point - if trans.distance equal 0,
                   * this means that we at the CURRENT point
                   * if this value differ from 0, this means that
                   * we are between CURRENT and NEXT point, value is
                   * distance to NEXT point
                   */
                  const from = (near.distance === 0) ? near.current._id : near.next._id;
                  // get position of point FROM in array of route points
                  const fromPointPosition = route.points.indexOf(from);
                  // total distance in metres
                  let distance = 0;
                  // node count
                  let nodes = 0;
                  // check if this trans BEFORE point
                  if (fromPointPosition <= currentPointPosition) {
                    /* We need to calculate distance between points
                     * with positions "pos" and "index" in array
                     * route.points; This distance saved in property Node.total
                     * for example, distance between points 2 and 3
                     * means length of node with index 2. That's why
                     * distance between points will means total length
                     * of nodes "pos" and "index-1"
                     */
                    // sum of nodes pos..index-1
                    for (let x = fromPointPosition; x < currentPointPosition; x++) {
                      nodes++;
                      distance += route.nodes[x].total;
                    }
                    // if this trans on a circle to current station
                  } else {
                    // sum of nodes 0..index-1
                    for (let y = 0; y < currentPointPosition - 1; y++) {
                      nodes++;
                      distance += route.nodes[y].total;
                    }
                    // sum of nodes pos..nodes.length
                    for (let z = fromPointPosition; z < route.nodes.length; z++) {
                      nodes++;
                      distance += route.nodes[z].total;
                    }
                  }
                  // at least, we will add distance to NEXT point
                  distance += near.distance;
                  // time calculation (minutes)
                  const time = distance / __defaultSpeed + nodes * __defaultStopTime;
                  result.routes.push({
                    status: 'OK',
                    route: routeId,
                    title: route.title,
                    distance,
                    time: time.toFixed(0)
                  });
                  // if nearest trans don't found, and there no trans on a lap+
                } else {
                  // return NOTRANS result
                  result.routes.push({
                    status: 'NOTRANS',
                    route: routeId,
                    title: route.title
                  });
                }
                // finish checking
                eachRouteCallback();
              });
            });
          }
        });
      }, () => {
        callback(result);
      });
    }
  });
};

/*
 * [P] getPersonalRoute - get route info for guide
 * @start - start point position (LatLng)
 * @end - end point position (LatLng)
 * @callback - callback function
 */
Service.prototype.getPersonalRoute = (start, end, mode, callback) => {
  // if start or end not set - callback error
  if ((!start) || (!end) || (!end.lat) || (!end.lng) || (!start.lat) || (!start.lng)) {
    callback({
      errpr: 'Invalid request'
    });
  }
  // array points for checking
  const points = [];
  // link to this
  const _this = this;
  // create gm points
  const gmStart = gm.checkAndConvertPoint([start.lat, start.lng]);
  const gmEnd = gm.checkAndConvertPoint([end.lat, end.lng]);
  // result object
  const result = {
    status: 'OK',
    result: null
  };
  // get google directions
  gm.directions(gmStart, gmEnd, (err, data) => {
    // if there not ways between these points - callback error
    // TO DO - find decision of this problem
    if (err) {
      callback({
        status: 'ERROR'
      });
      // if there are way(s)
    } else {
      // get important points from current route, which we find
      const { steps } = data.routes[0].legs[0];
      // check each step
      for (let i = 0; i < steps.length; i++) {
        // first (with index equal 0) - start location
        if (i === 0) points.push(steps[i].start_location);
        // all next - end location
        else points.push(steps[i].end_location);
      }
      // find points in nearest locations to START
      _this.__point.findNear(start, __defaultSearchPointRadius, (startResult) => {
        // find points in nearest locations to END
        _this.__point.findNear(end, __defaultSearchPointRadius, (endResult) => {
          // check count
          if ((startResult.points.length === 0) || (endResult.points.length === 0)) {
            callback({
              status: 'ERROR'
            });
          }
          // check points...
          async.each(startResult.points, (point, pointsCallback) => {
            // check routes of each point
            if (point.routes.length > 0) {
              // check each route and try to make road
              async.each(point.routes, (routeId, routesCallback) => {
                // try to make line through this route
                _this.__route.findById(routeId, (findRouteErr, currentRoute) => {
                  // next
                  if (!findRouteErr) {
                    // try to find ONE route between start and end
                    async.filterSeries(endResult.ids, (endPoint, filterRouteCallback) => {
                      // callback - if this is a point of currentRoute
                      filterRouteCallback(currentRoute.points.indexOf(endPoint) !== -1);
                    }, (xRoutes) => {
                      // make result for each route
                      if (xRoutes.length > 0) {
                        for (let i = 0; i < xRoutes.length; i++) {
                          // get start and end point ID
                          const startPointId = startResult.ids[startResult.points.indexOf(point)];
                          const endPointId = endResult.ids[i];
                          // get indexes
                          const indexA = currentRoute.points.indexOf(startPointId);
                          const indexB = currentRoute.points.indexOf(endPointId);
                          // check
                          if ((indexA !== -1) && (indexB !== -1)) {
                            // counter for distance
                            let distance = 0;
                            // if A point BEFORE B point
                            if (indexA < indexB) {
                              // calculate total distance
                              for (let indx = indexA; indx < indexB; indx++) {
                                distance += currentRoute.nodes[indx].total;
                              }
                              // if A point AFTER B point
                            } else {
                              for (let j = indexB; j < currentRoute.nodes.length; j++) {
                                distance += currentRoute.nodes[j].total;
                              }
                              for (let k = 0; k < indexB; k++) {
                                distance += currentRoute.nodes[k].total;
                              }
                            }
                            // calculate WALK TO
                            const distTo = utils.dist(start.lat, start.lng, point.lat, point.lng);
                            // find last station
                            const endStation = endResult.points[endResult.ids.indexOf(endPointId)];
                            // calculate WALK FROM
                            const distFrom = utils.dist(endStation.lat, endStation.lng, end.lat, end.lng);
                            // create current result
                            const r = {
                              type: 'ONE',
                              steps: [
                                {
                                  type: 'TO',
                                  route: currentRoute,
                                  start: null,
                                  end: startPointId,
                                  total: distTo
                                },
                                {
                                  type: 'BUS',
                                  route: currentRoute,
                                  start: startPointId,
                                  end: endPointId,
                                  total: distance
                                },
                                {
                                  type: 'FROM',
                                  route: currentRoute,
                                  start: endPointId,
                                  end: null,
                                  total: distFrom
                                }
                              ],
                              total: distance
                            };
                            // check if result exist
                            if (!result.result) {
                              result.result = r;
                            } else if (result.result.type === 'ONE') {
                              const totalWalkCurr = result.result.steps[0].total
                                + result.result.steps[2].total;
                              const totalWalkResultNew = distTo + distFrom;
                              // compare
                              const totalBusCurr = result.result.total;
                              // replace
                              if ((totalWalkCurr * 5 + totalBusCurr) > (totalWalkResultNew * 5
                                + distance)) result.result = r;
                              // add checks for other types
                            }
                          }
                        }
                        routesCallback();
                        /*
                       * TO DO:
                       * add creating route through more than one current routes
                       *
                       *
                       */
                      } else {
                        routesCallback();
                      }
                    });
                  } else {
                    routesCallback();
                  }
                });
              }, () => {
                pointsCallback();
              });
            } else {
              pointsCallback();
            }
            /*
             * finished checking points...
             */
          }, () => {
            // console.log(JSON.stringify(constiants));
            // all done
            callback(result);
          });
        });
      });
    }
  }, false, mode);
};

/*
 * [P] updateTransportData - update transport data in database
 * @_id - transport ID
 * @routeId - current route ID
 * @lat - transport latitude
 * @lng - transport longitude
 * @callback - callback function
 */
Service.prototype.updateTransportData = (_id, routeId, lat, lng, callback) => {
  const __this = this;
  // find each transport by _id
  this.__trans.findById(_id, (err, currentTrans) => {
    // check if we find each transport
    if ((!err) && (currentTrans)) {
      // find selected route
      __this.__route.findById(routeId, (findRouteErr, currentRoute) => {
        // check error
        if ((!findRouteErr) && (currentRoute)) {
          // set route
          currentTrans.route = routeId;
          // update latitude
          currentTrans.lat = lat;
          // update longitude
          currentTrans.lng = lng;
          // if position already searched
          if ((currentTrans.current._id) && (currentTrans.next._id)) {
            // calculate distance between CURRENT point and current transport position
            const length = utils.dist(lat, lng, currentTrans.current.lat, currentTrans.current.lng);
            // if we out of previous station
            if (length > __deltaDistance) {
              // calculate distance from current position to NEXT station
              const left = utils.dist(lat, lng, currentTrans.next.lat, currentTrans.next.lng);
              // check if we at the NEXT station
              if (left < __deltaDistance) {
                // set NEXT point as CURRENT point
                currentTrans.current = currentTrans.next;
                // set distance
                currentTrans.distance = 0;
                // get index of NEXT point in array route.points
                async.detect(currentRoute.points, (point, detectPointCallback) => {
                  detectPointCallback(point.toString() === currentTrans.next._id.toString());
                }, (nextPoint) => {
                  // if there are such point
                  if (nextPoint) {
                    // get index of NEXT.next point
                    let index = currentRoute.points.indexOf(nextPoint) + 1;
                    // WILL BE DECREASED (done)
                    index = (index === currentRoute.points.length - 1) ? 0 : index;
                    // find this point in db
                    __this.__point.findById(currentRoute.points[index], (findPointErr, newNextPoint) => {
                      // set new next point
                      currentTrans.next = {
                        lat: newNextPoint.lat,
                        lng: newNextPoint.lng,
                        title: newNextPoint.title,
                        _id: newNextPoint._id
                      };
                      // save this trans to db and response it
                      currentTrans.save((saveTransErr) => {
                        // return result
                        if (!saveTransErr) {
                          callback({ trans: currentTrans });
                        } else {
                          callback({ error: true });
                        }
                      });
                    });
                    // if there are not such point
                  } else {
                    currentTrans.save(() => {
                      callback({ error: true });
                    });
                  }
                });
                // we are between CURRENT and NEXT
              } else {
                currentTrans.distance = left;
                currentTrans.save(() => {
                  // TODO: add error checking
                  callback({ trans: currentTrans });
                });
              }
              // we are stayed at current station
            } else {
              currentTrans.save(() => {
                // TODO: add error checking
                callback({ trans: currentTrans });
              });
            }
            // position is not selected before
          } else {
            __this.__point.find({ routes: routeId }, (findPointErr, points) => {
              if (!findPointErr) {
                // async check each point
                async.detect(points, (point, detectPointCallback) => {
                  // calculate distance between each point and current position
                  const length = utils.dist(point.lat, point.lng, lat, lng);
                  // if we get required point
                  detectPointCallback(length < __deltaDistance);
                }, (currentPoint) => {
                  // there are required point
                  if (currentPoint) {
                    // get index of current point in point array, and increase it
                    let index = currentRoute.points.indexOf(currentPoint._id) + 1;
                    // if we get lat point - st index to 0, if other - don't change it
                    // WILL BE DECREASED (done #0.1.2)
                    index = (index === currentRoute.points.length - 1) ? 0 : index;
                    // get index of this point in point array
                    async.detect(points, (p, detectNextPointCallback) => {
                      detectNextPointCallback(p._id.toString() === currentRoute.points[index].toString());
                    }, (nextPoint) => {
                      if (nextPoint) {
                        currentTrans.current = {
                          lat: currentPoint.lat,
                          lng: currentPoint.lng,
                          title: currentPoint.title,
                          _id: currentPoint._id
                        };
                        currentTrans.next = {
                          lat: nextPoint.lat,
                          lng: nextPoint.lng,
                          title: nextPoint.title,
                          _id: nextPoint._id
                        };
                        currentTrans.distance = 0;
                        // update each trans data in database
                        currentTrans.save((saveTransErr) => {
                          if (!saveTransErr) {
                            callback({ trans: currentTrans });
                          }
                        });
                      }
                    });
                  } else {
                    currentTrans.save(() => {
                      callback({ error: true });
                    });
                  }
                });
              }
            });
          }
        }
      });
    }
  });
};

module.exports = Service;
