// IMPORTANT NOTE: If you rebuild this app, you must add "var app;" to the new
// deploy/App...html files just above "Rally.onReady(function () {"
//
Ext.define('CustomApp', {
  extend: 'Rally.app.TimeboxScopedApp',
  scopeType: 'release',
  componentCls: 'app',
  html: '<table><tr><td>' +
    '<div title="Create a task and assign it with estimate or enter initial capacity on the Team Status page.">' +
    '<b style="text-align:left;float:left;">' +
    '</b></div></td><td><div>' +
    '<input type="button" style="text-align:right;float:right;" value="Refresh" onClick="javascript: app.onScopeChange();"/></div>' +
    '</td></tr></table>',
  comboboxConfig: {
    fieldLabel: 'Select an release:</div>',
    width: 400
  },
  onScopeChange: function(timeboxscope) {
    console.log('onScopeChange');
    //defone store of the interations in the release
    var iterationStore = Ext.create('Rally.data.wsapi.Store', {
      model: 'Iteration',
      fetch: ['Name','UserIterationCapacities:summary','WorkProducts:summary','Project'],
      filters: [{
        property: 'StartDate',
        operator: '>=',
        value: timeboxscope.getRecord().get('formattedStartDate')
      }, {
        property: 'EndDate',
        operator: '<=',
        value: timeboxscope.getRecord().get('formattedEndDate')
      }],
      sorters: [{
        property: 'StartDate', //sort by StartDate earliest to latest
        direction: 'ASC'
      }],
      pageSize: 200,
      limit: 1000
    });
    iterationStore.load().then({
      success: function(iterationStoreLoadResults) {
        // debugger;
        //iterationStore results should be sorted already by sprint start date ASC
        console.log('iterationStore load promise success');
        sprintNames = this._getIterationNames(iterationStoreLoadResults);
        Deft.Promise.all([this._loadCapacities(iterationStoreLoadResults),this._loadStories(iterationStoreLoadResults)]).then({
          success: function(dataloadresults){
            var datarecords = this._processLoadResults(dataloadresults, sprintNames);
            this._displayGrid(datarecords, sprintNames);
          },
          failure: function() {
            console.log("results:Deft.Promise.all() failure");
          },
          scope: this
        });

      },
      failure: function() {
        console.log('iterationStore load promise failure');
      },
      scope: this
    });
  },
  _getIterationNames: function (iterations){
    var iterNames = [];
    //st
    _.each(iterations, function(iter){
      if (!iterNames.includes(iter.get('Name'))) {
        iterNames.push(iter.get('Name'));
      }
    });
    return iterNames;
  },
  _loadCapacities: function(iterations) {
    // debugger;
    var promises = [];
    _.each( iterations, function (iteration) {
      var uics = iteration.get("UserIterationCapacities");
      if (uics.Count > 0) {
        uics.store = iteration.getCollection('UserIterationCapacities');
        promises.push(uics.store.load());
      }
    });
    console.log(promises);
    return Deft.Promise.all(promises);
  },
  _loadStories: function(iterations) {
    // debugger;
    var uspromises = [];
    _.each(iterations, function (iteration) {
      if (iteration.get("WorkProducts").Count > 0) {
        //   wps.store = iteration.getCollection('WorkProducts', { model: 'userstory'}); THIS JUST DOESN"T WORK THIS WAY
        var storyStore = Ext.create('Rally.data.wsapi.Store', {
          model: 'User Story',
          fetch: ['Owner', 'PlanEstimate','Iteration'],
          filters: [{
            property: 'Iteration.ObjectID',
            operator: '=',
            value: iteration.get('ObjectID')
          }],
          sorter: [{
            property: 'Owner',
          }],
          pageSize: 200
        });
        uspromises.push(storyStore.load());
      }
    });
    // console.log(uspromises);
    return Deft.Promise.all(uspromises);
  },
  _processLoadResults: function(loadresults, sprintNames) {
    //loadresults should be two arrays, each being an array of a set of UserIterationCapacities or UserStories
    //loadresults[0] should be the capacities
    //loadresults[1] should be the UserStories
    //debugger;
    var temprecords = []; //array containing all multiple users pi_uic objects

    _.each(loadresults[0], function (sprint_uics) {
      // console.log(sprint_uics[0].get('Iteration')._refObjectName);
      _.each(sprint_uics, function (uic) {
        var sprint = uic.get("Iteration")._refObjectName;
        var user = uic.get('User')._refObjectName;
        var capacity = Ext.util.Format.round(uic.get('Capacity') / 6, 1);
        //console.log(uic.get("Iteration")._refObjectName + ' ' + uic.get('User')._refObjectName + ' ' + Ext.util.Format.round(uic.get('Capacity') / 6, 1));
        // console.log(sprint + ' ' + user + ' ' + capacity);
        //create a custum pi uic object for each uic found
        var temprec = temprecords.find(function findOwner(temprecords){
          return (temprecords.user === user);
        });
        if (temprec === undefined) {
          temprec = {};
          ////add a property for user name, the property name being "user" and value being the rally user name
          temprec.user = user;
          //add a property for the iteration, the prpoerty name being the iteration name
          // temprec[sprint] = {}; //each iteration capacity is an object with properties
          temprecords.push(temprec);
        }
        //update property for the specific iteration capacity
        //// TODO: check for null capacity
        if (temprec[sprint] === undefined) {
          temprec[sprint] = {};
          temprec[sprint].name = sprint;
          temprec[sprint].toString = function() {
            return this.name;
          };
        }
        temprec[sprint].capacityPts =  capacity;
        temprec[sprint].storyPts = 0;
        temprec[sprint].load = 0;

      });
    });

    _.each(loadresults[1], function (sprint_stories) {
      // console.log(sprint_stories[0].get('Iteration')._refObjectName);
      _.each(sprint_stories, function (story) {
        var sprint = story.get("Iteration")._refObjectName;
        var user;
        if (story.get('Owner') === null) {
            user = 'no owner';
        } else {
            user = story.get('Owner')._refObjectName;
        }
        var points;
        if (story.get('PlanEstimate') > 0) {
            points = story.get('PlanEstimate');
        } else {
            points = 0;
        }
        //console.log(uic.get("Iteration")._refObjectName + ' ' + uic.get('User')._refObjectName + ' ' + Ext.util.Format.round(uic.get('Capacity') / 6, 1));
        // console.log(sprint + ' ' + user + ' ' + points);
        //create a custum pi uic object for each uic found
        var temprec = temprecords.find(function findOwner(temprecords){
          return (temprecords.user === user);
        });
        if (temprec === undefined) {
          temprec = {};
          ////add a property for user name, the property name being "user" and value being the rally user name
          temprec.user = user;
          //add a property for the iteration, the prpoerty name being the iteration name
          // temprec[sprint] = {}; //each iteration capacity is an object with properties
          temprecords.push(temprec);
        }
        if (temprec[sprint] === undefined) {
          temprec[sprint] = {};
          temprec[sprint].name = sprint;
          temprec[sprint].capacityPts = 0;
          temprec[sprint].storyPts = 0;
          temprec[sprint].load = 0;
          temprec[sprint].toString = function() {
            return this.name;
          };
        }
        temprec[sprint].storyPts += points;
        // debugger;
        if (temprec[sprint].capacityPts > 0 && temprec[sprint].storyPts > 0) {
          // temprec[sprint].load = this._calcLoad(temprec[sprint].storyPts, temprec[sprint].capacityPts);
          temprec[sprint].load = Ext.util.Format.round(temprec[sprint].storyPts / temprec[sprint].capacityPts, 1);
        }
      });
    });
    // return temprecords;
    var gridrecords = [];
    _.each(temprecords, function(rec) {
      var gridrec = {};
      for (var prop in rec) {
        if (prop === 'user') {
          gridrec.Owner = rec.user;
        } else {
          // debugger;
          gridrec[prop.replace(/[ .]/g,'_')] = rec[prop].load;
        }
      }
      // debugger;
      gridrecords.push(gridrec);
    });
    // debugger;
    return gridrecords;
  },
  _calcLoad: function(l, c) {
    return Ext.util.Format.round(l/c, 1);
  },
  _displayGrid: function(datarecords, sprintNames) {
    // debugger;
    var cstore = Ext.create('Rally.data.custom.Store', {
      data: datarecords,
      sorters: [{
        property: 'Owner',
        direction: 'ASC'
      }]
    });
    cstore.loadData(datarecords);
    // console.log('custom store load sucesss');
    // console.log(cstore);

    var columns = [
      {
        text: 'Owner',
        dataIndex: 'Owner',
        width: 100
      }
    ];
    _.each(sprintNames, function(name) {
      columns.push({
        text: name.replace(/[ .]/g,'_'),
        // dataIndex: name.replace(/[ .]/g,'_')
        align: 'center',
        xtype: 'templatecolumn',
        //tpl: '{pointEst} / {capacityPts}'
        tpl: Ext.create('Rally.ui.renderer.template.progressbar.ProgressBarTemplate', {
            percentDoneName: name.replace(/[ .]/g,'_'),
            calculateColorFn: function(recordData) {
              //debugger;
                var loadval = recordData[name.replace(/[ .]/g,'_')];
                if (loadval > 0 && loadval <= 0.8) {
                    colVal = '#B2E3B6'; // Green
                } else if (loadval > 0.8 && loadval <= 1.0) {
                    colVal = '#006600'; // Dark Green
                    //colVal = '#B2E3B6'; // Green
                } else if (loadval > 1.0 && loadval < 1.25) {
                    colVal = '#FCB5B1'; // Red
                } else {
                    colVal = '#f61509'; // dark Red
                }
                return colVal;
            },
        })
      });
    });
    if (this._myGrid) {
      this._myGrid.destroy();
    }
    this._myGrid = Ext.create('Rally.ui.grid.Grid', {
      // xtype: 'rallygrid',
      xtype: 'rallygridboard',
      showRowActionsColumn: false,
      store: cstore,
      columnCfgs: columns,
      title: 'PI Iterations US Point load/capacity',
    });
    this.add(this._myGrid);
  }
});
