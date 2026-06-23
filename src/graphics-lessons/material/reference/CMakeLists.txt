add_executable(10_material main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(10_material glfw opengl32)
endif()

foreach(FILE_NAME cube.vs cube.fs light.vs light.fs)
    add_custom_command(TARGET 10_material POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:10_material>/${FILE_NAME}"
    )
endforeach()