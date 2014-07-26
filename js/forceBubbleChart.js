/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global require, define, yo, mobi, brackets: true, window, document, d3, _*/


(function (d3, _, un) {
    "use strict";
    var ForceBubbleChart = function (settings) {
        var defaults = {
            bindto: "body",
            height: 600,
            width: 600,
            data: [],
            uniqueProperties: [],
            tooltipProperties: [],
            bubbleColour: "",
            bubbleSize: ""
        };
        this.options = _.extend(defaults, settings);
        
        this._eleRefs = {
            rootEle: this.options.bindto,
            nodes: []
        };
        this._dims = {
            width: this.options.width,
            height: this.options.height,
            gravity: 0,
            charge: -100,
            friction: 0.8,
            velocityFactor: 0.8,
            originCords: {
                x: 0,
                y: 0
            },
            exitCords: {
                x: 0,
                y: 0
            },
            padding: 20
        };
        this._params = {
            uniqueProperties: this.options.uniqueProperties,
            tooltipProperties: this.options.tooltipProperties,
            classifierProperty: this.options.classifier,
            bubbleSize: this.options.bubbleSize,
            bubbleColour: this.options.bubbleColour
        };
        this._runtime = {
            data: this.options.data,
            nodeMap: {},
            fillMap: {}
        };
        
        this._initialize();
    };
    
    ForceBubbleChart.prototype = {
        //Initializes the force.
        //Draws/Redraws the container with dims.height & dims.width
        //Sets the data
        _initialize: function () {
            this._initializeForce();
            this._drawContainer();
            this.setData(this._runtime.data);
        },
        
        //Initializes d3.layout.force with values from dims.
        _initializeForce: function () {
            this._runtime.force = d3.layout.force()
                .gravity(this._dims.gravity)
                .charge(this._dims.charge)
                .friction(this._dims.friction)
                .size([this._dims.width, this._dims.height])
                .on('tick', this._tick.bind(this))
                .start();
        },
        
        //Draw/Redraws the container with dims.height & width.
        _drawContainer: function () {
            if (this._eleRefs.svg === un) {
                this._eleRefs.svg = d3.select(this._eleRefs.rootEle)
                    .append('svg');
            }
            this._eleRefs.svg
                .attr('height', this._dims.height)
                .attr('width', this._dims.width);
        },
        
        //@Public
        //Sets svg width to dims.width and redraws the container.
        setWidth: function (width) {
            this._dims.width = width;
            this._initialize();
            return this;
        },
        
        //@Public
        //Sets svg height to dims.height and redraws the container.
        setHeight: function (height) {
            this._dims.height = height;
            this._initialize();
            return this;
        },
        
        //@Public
        //Sets data and simulates force.
        setData: function (data) {
            this._runtime.data = data;
            this._updateNodeMap();
            this._updateClassifier();
            this._runtime.force.alpha(0.1).start();
            return this;
        },
        
        //@Public
        //Sets classifier and simulates force.
        setClassifier: function (sClassifier) {
            this._params.classifierProperty = sClassifier;
            this._updateClassifier();
            this._runtime.force.alpha(0.1).start();
            return this;
        },
        
        //Updates classifierCenters, chargeDistance and radiusScale.
        //Draws classifier.
        _updateClassifier: function () {
            this._updateClassifierCenters();
            this._updateChargeDistance();
            this._updateRadiusScale();
            this._drawClassifier();
        },
        
        //Uses d3.layout.treemap to fetch classifier centers and update it.
        _updateClassifierCenters: function () {
            var self = this,
                centers,
                map;
            centers = _(this._runtime.nodeMap)
                .chain()
                .reject(function (node) {return node.state === "exiting"; })
                .pluck("data")
                .pluck(self._params.classifierProperty)
                .unique()
                .map(function (val) {
                    return {
                        name: val,
                        value: 1
                    };
                }).value();
            
            map = d3.layout.treemap()
                .size([self._dims.width, self._dims.height])
                .ratio(1)
                .sort(function (a, b) {
                    return d3.ascending(b.name, a.name);
                });
            map.nodes({children: centers});
            
            this._runtime.classifierCenters = centers;
        },
        
        //Finds the maximum width and height of classifier rects
        //Calculate the diagonal distance and set it as charge distance.
        //It ensures that the charge force on a node is applied only by the nodes within its rect and not by nodes from neighbouring rects.
        //Helps positioning nodes at the center of each rect.
        _updateChargeDistance: function () {
            var maxDimenstions = _(this._runtime.classifierCenters)
                .reduce(function (p, c, i, a) {
                    var resObj = {};
                    resObj.dx = p.dx > c.dx ? p.dx : c.dx;
                    resObj.dy = p.dy > c.dy ? p.dy : c.dy;
                    return resObj;
                }, {dx: 0, dy: 0}),
                chargeDistance = Math.sqrt(maxDimenstions.dx * maxDimenstions.dx + maxDimenstions.dy * maxDimenstions.dy);
            this._runtime.force.chargeDistance(chargeDistance / 2);
        },
        
        //Draws classifier text.
        //Removes the boundary rects and draw it after a delay so that the transition of nodes is not covered up by rects.
        _drawClassifier: function () {
            this._drawClassifierText();
            if (this._eleRefs.classifierBoundaryRects) {
                this._eleRefs.classifierBoundaryRects.remove();
            }
            var self = this;
            window.setTimeout(self._drawClassifierBoundary.bind(self), 750);
        },
        
        //classifier texts are appended/modified/removed with transitions.
        _drawClassifierText: function () {
            this._eleRefs.classifierTexts = this._eleRefs.svg.selectAll('text')
                .data(this._runtime.classifierCenters, function (d) {return d.name; });
            //UPDATE
            this._eleRefs.classifierTexts
                .transition()
                .duration(750)
                .attr('x', this._fnClassifierTextXAttr)
                .attr('y', function (d, i) {return (d.y + 20); });
            //ENTER
            this._eleRefs.classifierTexts.enter()
                .append('text')
                .attr('class', "fbchart-enter fbchart-label")
                .text(this._fnClassifierTextValue)
                .attr('dy', ".35em")
                .attr('x', 0)
                .attr('y', 0)
                .style("fill-opacity", 1e-6)
                .transition()
                .duration(750)
                .attr('x', this._fnClassifierTextXAttr)
                .attr('y', function (d, i) {return (d.y + 20); })
                .style('fill-opacity', 1);
            //EXIT
            this._eleRefs.classifierTexts.exit()
                .attr('class', "fbchart-exit")
                .transition()
                .duration(750)
                .attr('x', 0)
                .attr('y', 0)
                .style('fill-opacity', 1e-6)
                .remove();
        },
        
        //Classifier boundary rects are added/modified/removed with transitions.
        _drawClassifierBoundary: function () {
            this._eleRefs.classifierBoundaryRects = this._eleRefs.svg.selectAll('rect')
                .data(this._runtime.classifierCenters, function (d) {return d.name; });
            //UPDATE
            this._eleRefs.classifierBoundaryRects
                .attr('x', function (d, i) {return d.x; })
                .attr('y', function (d, i) {return d.y; })
                .attr('width', function (d, i) {return d.dx; })
                .attr('height', function (d, i) {return d.dy; });
            //ENTER
            this._eleRefs.classifierBoundaryRects.enter()
                .append('rect')
                .attr('class', "fbchart-enter fbchart-rect")
                .attr('x', function (d, i) {return d.x; })
                .attr('y', function (d, i) {return d.y; })
                .attr('width', 0)
                .attr('height', 0)
                .transition()
                .duration(750)
                .attr('width', function (d, i) {return d.dx; })
                .attr('height', function (d, i) {return d.dy; });
            //EXIT
            this._eleRefs.classifierBoundaryRects.exit()
                .attr('class', "fbchart-exit")
                .transition()
                .duration(750)
                .attr('width', 0)
                .attr('height', 0)
                .remove();
        },
        
        //Removes all existing nodes.
        //Prepares new nodemap pushing new nodes with "entering" state, exiting nodes with "exiting" state and other nodes in "updating" state.
        //Pushes all nodes to force.nodes()
        _updateNodeMap: function () {
            var self = this;
            
            this._removeExitingNodes();
            
            var newNodeMap = {};
            
            _(this._runtime.data).each(function (datum) {
                var uniqueKey = self._getUniqueValue(datum);
                
                if (!_(self._runtime.nodeMap).has(uniqueKey)) {
                    newNodeMap[uniqueKey] = {
                        data: datum,
                        state: "entering",
                        px: self._dims.originCords.x,
                        py: self._dims.originCords.y,
                        x: self._dims.originCords.x,
                        y: self._dims.originCords.y,
                        radius: self._fnRadius,
                        classifier: self._fnClassifier(datum),
                        targetX: function (d) { return self._fnTargetCordinates(d).x; },
                        targetY: function (d) { return self._fnTargetCordinates(d).y; },
                        fill: self._fnFill
                    };
                } else {
                    newNodeMap[uniqueKey] = _(self._runtime.nodeMap[uniqueKey]).omit("index", "weight");
                    delete self._runtime.nodeMap[uniqueKey];
                }
            });
            
            _(this._runtime.nodeMap).each(function (val, uniqueKey) {
                val.state = "exiting";
                val.opacity = 1;
                newNodeMap[uniqueKey] = val;
                delete self._runtime.nodeMap[uniqueKey];
            });
            
            this._runtime.nodeMap = newNodeMap;
            this._runtime.force.nodes(_(this._runtime.nodeMap).values());
        },
        
        //Tick listener for force layout.
        //Updates x & y position for every node pushing it closer to target position by a factor of velocity.
        //Updates fill-opacity for exiting nodes
        //Check collision using collision-detection logic.
        _tick: function (e) {
            var velocity = e.alpha * this._dims.velocityFactor;
            
            _(this._runtime.nodeMap)
                .each(function (node) {
                    node.x += (node.targetX(node) - node.x) * velocity;
                    node.y += (node.targetY(node) - node.y) * velocity;
                    if (node.state === "exiting") {
                        node.opacity += (1e-6 - node.opacity) * velocity;
                    }
                });
            this._collide(velocity);
            this._drawNodes();
        },
        
        //Standard collision-detection logic using quadtree carried out on updating nodes.
        _collide: function (velocity) {
            var self = this,
                quadtree = d3.geom.quadtree(_(self._runtime.nodeMap)
                    .chain()
                    .values()
                    .filter(function (node) {
                        return node.state === "updating";
                    })
                    .value()
                    );
            _(this._runtime.nodeMap).each(function (node) {
                var r = self._fnRadius(node) + self._dims.maxRadius + (self._dims.maxRadius), //padding
                    nx1 = node.x - r,
                    nx2 = node.x + r,
                    ny1 = node.y - r,
                    ny2 = node.y + r;
                quadtree.visit(function (quad, x1, y1, x2, y2) {
                    if (quad.point && (quad.point !== node) && (quad.point.state !== "exiting")) {
                        var x = node.x - quad.point.x,
                            y = node.y - quad.point.y,
                            l = Math.sqrt(x * x + y * y),
                            r = self._fnRadius(node) + self._fnRadius(quad.point) + (self._dims.maxRadius); // padding
                        if (l < r) {
                            l = (l - r) / l * velocity;
                            node.x -= x *= l;
                            node.y -= y *= l;
                            quad.point.x += x;
                            quad.point.y += y;
                        }
                    }
                    return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
                });
            });
        },
        
        //Appends new nodes with class "entering" and update the class to "updating" and pushes to nodes array.
        //Updates x & y position for all nodes and opacity for exiting nodes.
        _drawNodes: function () {
            var self = this;
            _(this._runtime.nodeMap).each(function (node) {
                var nodeRef;
                if (node.state === "entering") {
                    node.state = "updating";
                    nodeRef = self._eleRefs.svg.append('circle')
                        .data([node])
                        .attr('class', "fbchart-circle")
                        .attr('cx', function (d, i) {return d.x; })
                        .attr('cy', function (d, i) {return d.y; })
                        .attr('r', self._fnRadius.bind(self))
                        .attr("state", function (d, i) {return d.state; })
                        .attr("uniqueKey", function (d, i) {return self._getUniqueValue(d.data); })
                        .style('fill', self._fnFill.bind(self))
                        .style('stroke', function (d, i) {return d3.rgb(self._fnFill.bind(self)(d, i)).darker(2); })
                        .call(self._fnTooltip.bind({ctx: self, data: node.data}));
                    
                    self._eleRefs.nodes.push(nodeRef);
                    
                } else {
                    nodeRef = _(self._eleRefs.nodes).chain()
                        .filter(function (nodeRef) {
                            return nodeRef.attr("uniqueKey") === self._getUniqueValue(node.data);
                        })
                        .first()
                        .value();
                    
                    nodeRef.attr('cx', node.x)
                        .attr('cy', node.y)
                        .attr('r', self._fnRadius.bind(self)(node))
                        .attr("state", node.state);
                    if (node.state === "exiting") {
                        nodeRef.style('opacity', node.opacity);
                    }
                }
            });
        },
        
        //Removes all nodes with state "exiting" from DOM, nodemap and nodeRefs.
        _removeExitingNodes: function () {
            var self = this;
            d3.selectAll("[state=exiting]").each(function (node, i) {
                var uniqueKey = self._getUniqueValue(node.data),
                    nodeRef = _(self._eleRefs.nodes)
                        .chain()
                        .filter(function (node) {
                            return node.attr("uniqueKey") === uniqueKey;
                        })
                        .first()
                        .value();
                delete self._runtime.nodeMap[uniqueKey];
                self._eleRefs.nodes.splice(self._eleRefs.nodes.indexOf(nodeRef), 1);
                this.remove();
            });
        },
        
        //Creates a scale such that even most occupied classifier rect area is also accomodated without much collision.
        //Also updates the max radius.
        _updateRadiusScale: function () {
            var maxAreaContributorObj = this._getMaximumAreaContributor(),
                maxAreaOccupiedByData = maxAreaContributorObj ? maxAreaContributorObj.area : 0,
                maxAreaAvailablePerClassifier = _(this._runtime.classifierCenters).sample() ? _(this._runtime.classifierCenters).sample().area * 0.6 : 0,
                domainArray = [0, maxAreaOccupiedByData],
                rangeArray = [0, maxAreaAvailablePerClassifier];
            
            this._runtime.radiusScale = function (r) {
                var areaInData = Math.PI * r * r,
                    areaInPixels = d3.scale.linear().domain(domainArray).range(rangeArray)(areaInData),
                    radiusInPixels = Math.sqrt(areaInPixels / Math.PI);
                return radiusInPixels / 2;
            };
            
            var maxBubbleSizeValue = _(this._runtime.nodeMap)
                .chain()
                .reject(function (node) {return node.state === "exiting"; })
                .pluck("data")
                .pluck(this._params.bubbleSize)
                .max()
                .value();
            
            this._dims.maxRadius = this._runtime.radiusScale(maxBubbleSizeValue);
        },
        
        //Returns the classifier rect that is most occupied in terms of area.
        _getMaximumAreaContributor: function () {
            var self = this,
                contributorObj = _(this._runtime.nodeMap).chain()
                    .reject(function (node) {return node.state === "exiting"; })
                    .pluck('data')
                    .groupBy(this._params.classifierProperty)
                    .map(function (data) {
                        return data.reduce(function (p, c) {
                            return {
                                name: c[self._params.classifierProperty],
                                area: p.area + Math.PI * Math.pow(parseFloat(c[self._params.bubbleSize], 10), 2)
                            };
                        }, {name: 'start', area: 0});
                    })
                    .sortBy('area')
                    .last()
                    .value();
            return contributorObj;
        },
        
        //Returns the unique value for a data by joining the unique properties with a "-".
        _getUniqueValue: function (datum) {
            return _(this._params.uniqueProperties)
                .chain()
                .map(function (u) {
                    return datum[u];
                }).value()
                .join("-");
        },
        
        //Returns the tooltip text for a data by joining the tooltip properties with a "\n".
        _getTooltipText: function (datum) {
            return _(this._params.tooltipProperties)
                .chain()
                .map(function (u) {
                    return datum[u];
                }).value()
                .join("\n");
        },
        
        //Retuns Classifier Text value by "ellipsising" the text if it exceeds the boundary.
        _fnClassifierTextValue: function (d, i) {
            var nameLength = d.name.length,
                lengthInPixels = nameLength * 10; // 1 Letter -> 10px Approx.
            if (lengthInPixels > d.dx) {
                var excessLength = lengthInPixels - d.dx,
                    excessChars = Math.round(excessLength / 10);
                return d.name.substr(0, d.name.length - excessChars) + "...";
            }
            return d.name;
        },
        
        //Returns the x attr for classifier text making sure that the text is always center aligned.
        _fnClassifierTextXAttr: function (d, i) {
            var nameLength = d.name.length,
                lengthInPixels = nameLength * 10; // 1 Letter -> 10px Approx.
            if (lengthInPixels > d.dx) {
                return d.x + 2; // 2 padding.
            }
            return (d.x + (d.dx / 2)) - (lengthInPixels / 2);
        },
        
        //Apply the radius scale and return the radius in px.
        _fnRadius: function (d, i) {
            return this._runtime.radiusScale(d.data[this._params.bubbleSize], i);
        },
        
        //Returns the fill colour from fillMap.
        //A hash map is used so that unique colour for a value is maintained even when the data is changed.
        _fnFill: function (d, i) {
            var fillKey = d.data[this._params.bubbleColour];
            if (!_(this._runtime.fillMap).has(fillKey)) {
                this._runtime.fillMap[fillKey] = d3.scale.category20().range()[_(this._runtime.fillMap).keys().length];
            }
            return this._runtime.fillMap[fillKey];
        },
        
        //Returns the target cordinates based on the state of the node.
        //For "updating" nodes --> corresponding classifier centers
        //    "exiting" nodes --> exit cordinates.
        _fnTargetCordinates: function (d, i) {
            switch (d.state) {
            case "exiting":
                return this._dims.exitCords;
            default:
                var centerCords = _(this._runtime.classifierCenters).findWhere({name: d.data[this._params.classifierProperty]});
                return {
                    x: centerCords.x + (centerCords.dx / 2),
                    y: centerCords.y + (centerCords.dy / 2)
                };
            }
        },
        
        //Returns the classifier value for the data.
        _fnClassifier: function (d, i) {
            return d[this._params.classifierProperty];
        },
        
        //Insert title attribute into every node.
        _fnTooltip: function (nodeRef) {
            nodeRef.append('title')
                .text(this.ctx._getTooltipText(this.data));
        }
    };
    
    window.ForceBubbleChart = ForceBubbleChart;
    
}(d3, _));