import React from 'react';
import { shallowWithInjectIntl } from '../../common/utils/TestUtils';
import { FeaturePageImpl } from './FeaturePage';
import {
  mockFeatureTable,
  mockFeature,
  mockJobConsumer,
  mockJobProducer,
  error500,
} from '../utils/test-utils';
import DatabricksUtils from '../../common/utils/DatabricksUtils';
import { ErrorView } from '../../common/components/ErrorView';
import Utils from '../../common/utils/Utils';

const getDefaultFeaturePageProps = (overrides = {}) => ({
  featureTableName: '',
  featureName: '',
  featureTable: {},
  feature: {},
  jobConsumers: [],
  notebookConsumers: [],
  modelVersionsByFeature: {},
  featureTags: {},
  getFeatureTableApi: jest.fn(() => Promise.resolve({})),
  getFeatureApi: jest.fn(() => Promise.resolve({})),
  updateFeatureApi: jest.fn(() => Promise.resolve({})),
  getConsumersApi: jest.fn(() => Promise.resolve({})),
  getJobApi: jest.fn(() => Promise.resolve({})),
  getNotebooks: jest.fn(() => Promise.resolve({})),
  searchModelVersionsByFeatureApi: jest.fn(() => Promise.resolve({})),
  listModelEndpointsApi: jest.fn(() => Promise.resolve({})),
  getTagsForFeatureApi: jest.fn(() => Promise.resolve({})),
  setTagsForFeatureApi: jest.fn(() => Promise.resolve({})),
  deleteTagsForFeatureApi: jest.fn(() => Promise.resolve({})),
  ...overrides,
});

const flushPromises = () => new Promise(setImmediate);

// Create an array of size (upper-lower) of features with suffixes [lower, upper)
const makeFeaturesArray = (lower, upper) =>
  [...Array(upper - lower)].map((n, index) => `feature_${index + lower}`);

describe('FeaturePage', () => {
  let mockErrorToast;
  let errorApi;

  beforeEach(() => {
    // listEndpoint will only trigger if model serving v1 is enabled
    // setting to true here to make sure we have full test coverage on API requests.
    DatabricksUtils.isModelServingEnabled = jest.fn(() => true);
    mockErrorToast = jest.fn();
    Utils.logErrorAndNotifyUser = mockErrorToast;
    errorApi = jest.fn(() => Promise.reject(error500));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders with minimal props and store without exploding', () => {
    const wrapper = shallowWithInjectIntl(<FeaturePageImpl {...getDefaultFeaturePageProps()} />);

    expect(wrapper.find('[data-test-id="feature-page"]').length).toBe(1);
  });

  it('calls getFeature API to get feature', async () => {
    const getFeatureTableApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          feature_table: mockFeatureTable(),
        },
      }),
    );
    const props = {
      ...getDefaultFeaturePageProps({
        featureTableName: 'feature_tableX',
        getFeatureTableApi: getFeatureTableApiMock,
      }),
    };
    shallowWithInjectIntl(<FeaturePageImpl {...props} />);

    await flushPromises();
    expect(props.getFeatureApi.mock.calls[0][0]).toEqual('feature_tableX');
  });

  it('feature store batch API call failures are captured and displayed as error toast', () => {
    const getFeatureTableApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          feature_table: mockFeatureTable({ id: '123456' }),
        },
      }),
    );
    // batch endpoints
    ['getNotebooks', 'getConsumersApi', 'getTagsForFeatureApi'].forEach(async (api) => {
      const wrapper = shallowWithInjectIntl(
        <FeaturePageImpl
          {...getDefaultFeaturePageProps({
            getFeatureTableApi: getFeatureTableApiMock,
            [api]: errorApi,
          })}
        />,
      );
      await flushPromises();
      expect(mockErrorToast).toHaveBeenCalledTimes(1);
      expect(wrapper.find(ErrorView).length).toBe(0);
    });
  });

  it('listModelEndpointsApi 5XX error is captured and displayed as error toast', async () => {
    errorApi = jest.fn(() => Promise.reject(error500));
    const getFeatureTableApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          feature_table: mockFeatureTable({ id: '123456' }),
        },
      }),
    );

    const wrapper = shallowWithInjectIntl(
      <FeaturePageImpl
        {...getDefaultFeaturePageProps({
          getFeatureTableApi: getFeatureTableApiMock,
          listModelEndpointsApi: errorApi,
        })}
      />,
    );
    await flushPromises();
    expect(mockErrorToast).toHaveBeenCalledTimes(1);
    expect(wrapper.find(ErrorView).length).toBe(0);
  });

  it('searchModelVersionsByFeatureApi 5XX error is captured and displayed as error toast', async () => {
    // only let it fail on the first call, failure of first call
    // should not interfere with the subsequence calls
    let fail = true;
    errorApi = jest.fn(() => {
      if (fail) {
        fail = false;
        return Promise.reject(error500);
      } else {
        return Promise.resolve({});
      }
    });
    // 487 features should trigger 3 separate searchModelVersionsByFeatureApi calls
    // as max features per request is 200.
    const expectedFeatures = makeFeaturesArray(0, 487);
    const getFeatureTableApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          feature_table: mockFeatureTable({
            features: expectedFeatures,
          }),
        },
      }),
    );
    const wrapper = shallowWithInjectIntl(
      <FeaturePageImpl
        {...getDefaultFeaturePageProps({
          getFeatureTableApi: getFeatureTableApiMock,
          searchModelVersionsByFeatureApi: errorApi,
        })}
      />,
    );
    await flushPromises();
    expect(errorApi).toHaveBeenCalledTimes(3);
    expect(mockErrorToast).toHaveBeenCalledTimes(1);
    expect(wrapper.find(ErrorView).length).toBe(0);
  });

  it('getJobApi 5XX errors are captured and displayed as error toast', async () => {
    // fail for job 123 and 321, such failure should not interfere with other calls
    const mockGetJobErrorApi = jest.fn((jobId) =>
      [123, 321].includes(jobId) ? Promise.reject(error500) : Promise.resolve({}),
    );
    const getFeatureTableApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          feature_table: mockFeatureTable({
            jobProducers: [
              mockJobProducer(123, 111, 1234, 'creator'),
              mockJobProducer(456, 222, 1234, 'creator'),
            ],
          }),
        },
      }),
    );
    const getConsumersApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          consumers: [mockJobConsumer(321, 111, []), mockJobConsumer(654, 222, [])],
        },
      }),
    );
    const wrapper = shallowWithInjectIntl(
      <FeaturePageImpl
        {...getDefaultFeaturePageProps({
          getFeatureTableApi: getFeatureTableApiMock,
          getConsumersApi: getConsumersApiMock,
          getJobApi: mockGetJobErrorApi,
        })}
      />,
    );
    await flushPromises();
    // 2 getJob (job consumer) calls
    expect(mockGetJobErrorApi).toHaveBeenCalledTimes(2);
    // In case of >= 500 errors, 1 independent failure from getJob
    expect(mockErrorToast).toHaveBeenCalledTimes(1);
    expect(wrapper.find(ErrorView).length).toBe(0);
  });

  it('calls jobs API for each job consumer in the current workspace', async () => {
    const workspaceId1 = '6666666';
    const workspaceId2 = '1234567';
    const workspaceId3 = '9876543';
    DatabricksUtils.getCurrentWorkspaceId = jest.fn().mockReturnValue(workspaceId1);

    const getFeatureTableApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          feature_table: mockFeatureTable({
            name: 'feature_tableX',
            jobProducers: [],
            notebookProducers: [],
          }),
        },
      }),
    );
    const getConsumersApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          consumers: [
            { job_run: { job_id: 123, job_workspace_id: workspaceId1 } },
            { job_run: { job_id: 666, job_workspace_id: workspaceId2 } },
            { job_run: { job_id: 456, job_workspace_id: workspaceId1 } },
            { job_run: { job_id: 999, job_workspace_id: workspaceId3 } },
            { job_run: { job_id: 789, job_workspace_id: workspaceId1 } },
          ],
        },
      }),
    );
    const props = {
      ...getDefaultFeaturePageProps({
        getFeatureTableApi: getFeatureTableApiMock,
        getConsumersApi: getConsumersApiMock,
      }),
    };
    shallowWithInjectIntl(<FeaturePageImpl {...props} />);

    await flushPromises();

    expect(props.getJobApi.mock.calls[0]).toEqual([123]);
    expect(props.getJobApi.mock.calls[1]).toEqual([456]);
    expect(props.getJobApi.mock.calls[2]).toEqual([789]);
  });

  it('calls the notebook fetcher for each notebook consumer in the current workspace', async () => {
    const workspaceId1 = '6666666';
    const workspaceId2 = '1234567';
    const workspaceId3 = '9876543';
    DatabricksUtils.getCurrentWorkspaceId = jest.fn().mockReturnValue(workspaceId1);

    const getFeatureTableApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          feature_table: mockFeatureTable({
            name: 'feature_tableX',
            jobProducers: [],
            notebookProducers: [],
          }),
        },
      }),
    );
    const getConsumersApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          consumers: [
            { notebook: { notebook_id: 123, notebook_workspace_id: workspaceId1 } },
            { notebook: { notebook_id: 666, notebook_workspace_id: workspaceId2 } },
            { notebook: { notebook_id: 456, notebook_workspace_id: workspaceId1 } },
            { notebook: { notebook_id: 999, notebook_workspace_id: workspaceId3 } },
            { notebook: { notebook_id: 789, notebook_workspace_id: workspaceId1 } },
          ],
        },
      }),
    );
    const props = {
      ...getDefaultFeaturePageProps({
        getFeatureTableApi: getFeatureTableApiMock,
        getConsumersApi: getConsumersApiMock,
      }),
    };

    const { top, self } = window;
    delete window.top;
    delete window.self;
    window.top = {
      ...top,
      treeCollection: {},
      conn: {},
    };
    window.self = { ...self };

    shallowWithInjectIntl(<FeaturePageImpl {...props} />);
    await flushPromises();

    expect(props.getNotebooks.mock.calls.length).toBe(1);
    expect(props.getNotebooks.mock.calls[0][0]).toEqual([123, 456, 789]);
    expect(props.getNotebooks.mock.calls[0][1].treeCollection).toBe(window.top.treeCollection);
    expect(props.getNotebooks.mock.calls[0][1].windowConnection).toBe(window.top.conn);

    window.top = top;
    window.self = self;
  });

  it('calls searchModelVersionsByFeatureApi to get model versions', async () => {
    const expectedFeatureTableName = 'feature_tableA';
    const expectedFeatures = ['featureA', 'featureB', 'featureC'];
    const getFeatureTableApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          feature_table: mockFeatureTable({
            name: expectedFeatureTableName,
            features: expectedFeatures,
          }),
        },
      }),
    );
    const props = {
      ...getDefaultFeaturePageProps({
        featureTableName: 'feature_tableA',
        getFeatureTableApi: getFeatureTableApiMock,
      }),
    };
    shallowWithInjectIntl(<FeaturePageImpl {...props} />);

    await flushPromises();
    const { featureTableName, featureNames } =
      props.searchModelVersionsByFeatureApi.mock.calls[0][0];
    expect(featureTableName).toEqual(expectedFeatureTableName);
    expect(featureNames).toEqual(expectedFeatures);
  });

  it('calls searchModelVersionsByFeatureApi with more than max batch limit features', async () => {
    const expectedFeatureTableName = 'feature_tableZ';
    const expectedFeatures = makeFeaturesArray(0, 487);
    const getFeatureTableApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          feature_table: mockFeatureTable({
            name: expectedFeatureTableName,
            features: expectedFeatures,
          }),
        },
      }),
    );
    const props = {
      ...getDefaultFeaturePageProps({ getFeatureTableApi: getFeatureTableApiMock }),
    };
    shallowWithInjectIntl(<FeaturePageImpl {...props} />);

    await flushPromises();
    const receivedFeatureCalls = props.searchModelVersionsByFeatureApi.mock.calls.map(
      (call) => call[0].featureNames,
    );
    expect(receivedFeatureCalls).toEqual([
      makeFeaturesArray(0, 200),
      makeFeaturesArray(200, 400),
      makeFeaturesArray(400, 487),
    ]);
  });

  it('calls getTagsForFeatureApi to get feature tags', async () => {
    const getFeatureTableApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          feature_table: mockFeatureTable(),
        },
      }),
    );
    const getFeatureApiMock = jest.fn(() =>
      Promise.resolve({
        value: {
          feature: mockFeature({ name: 'featureA', id: '654321' }),
        },
      }),
    );
    const props = {
      ...getDefaultFeaturePageProps({
        featureTableName: 'feature_tableX',
        featureName: 'featureA',
        getFeatureTableApi: getFeatureTableApiMock,
        getFeatureApi: getFeatureApiMock,
      }),
    };
    shallowWithInjectIntl(<FeaturePageImpl {...props} />);

    await flushPromises();
    expect(props.getTagsForFeatureApi.mock.calls[0][0]).toEqual('feature_tableX');
    expect(props.getTagsForFeatureApi.mock.calls[0][1]).toEqual('featureA');
    expect(props.getTagsForFeatureApi.mock.calls[0][2]).toEqual('654321');
  });
});